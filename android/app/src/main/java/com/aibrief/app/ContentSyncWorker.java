package com.aibrief.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Checks the AI Brief API for newly published articles, videos and tutorials, even when the app is closed.
 * The first check per content type only records a baseline, so nobody is flooded with old items.
 */
public class ContentSyncWorker extends Worker {
    public static final String PREFS = "content_alerts";
    private static final String WORK = "content-alerts-sync";
    // key, endpoint, singular, plural, detail route, list route
    private static final String[][] TYPES = {
        {"articles", "/articles", "article", "articles", "/articles/", "/articles"},
        {"videos", "/videos", "video", "videos", "/videos/", "/videos"},
        {"tutorials", "/tutorials", "tutorial", "tutorials", "/tutorials/", "/guides"}
    };

    public ContentSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    private static Constraints online() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    public static void schedule(Context ctx) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(ContentSyncWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(online())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.MINUTES)
            .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE, req);
    }

    public static void cancel(Context ctx) {
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK);
    }

    public static void runOnce(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(ContentSyncWorker.class).setConstraints(online()).build();
        WorkManager.getInstance(ctx).enqueueUniqueWork(WORK + "-now", ExistingWorkPolicy.REPLACE, req);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = sp.edit();
        ed.putLong("lastCheck", System.currentTimeMillis());
        String base = sp.getString("baseUrl", "");
        if (!sp.getBoolean("enabled", false)) {
            ed.putString("lastResult", "Alerts are off").apply();
            return Result.success();
        }
        if (base == null || base.isEmpty()) {
            ed.putString("lastResult", "No server connected").apply();
            return Result.success();
        }
        int found = 0;
        boolean failed = false;
        for (String[] t : TYPES) {
            if (!sp.getBoolean(t[0], true)) continue;
            try {
                JSONArray items = fetch(base + t[1] + "?pageNumber=1&pageSize=20");
                String seenKey = "seen_" + t[0];
                boolean hasBaseline = sp.contains(seenKey);
                Set<String> seen = new HashSet<>(sp.getStringSet(seenKey, new HashSet<String>()));
                Set<String> current = new HashSet<>();
                List<JSONObject> fresh = new ArrayList<>();
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.optJSONObject(i);
                    if (o == null) continue;
                    String id = o.optString("id", o.optString("slug", ""));
                    if (id.isEmpty()) continue;
                    current.add(id);
                    if (seen.add(id) && hasBaseline) fresh.add(o);
                }
                ed.putStringSet(seenKey, seen.size() > 400 ? current : seen);
                if (!fresh.isEmpty()) {
                    found += fresh.size();
                    ContentNotifier.announce(ctx, t, fresh);
                }
            } catch (Exception e) {
                failed = true;
            }
        }
        ed.putString("lastResult", failed ? "Could not reach the server" : found == 0 ? "Up to date" : found + " new item(s) found").apply();
        return failed && getRunAttemptCount() < 3 ? Result.retry() : Result.success();
    }

    private static JSONArray fetch(String address) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(address).openConnection();
        try {
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("Accept", "application/json");
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) throw new java.io.IOException("HTTP " + code);
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }
            String body = sb.toString().trim();
            if (body.startsWith("[")) return new JSONArray(body);
            JSONArray items = new JSONObject(body).optJSONArray("items");
            return items == null ? new JSONArray() : items;
        } finally {
            conn.disconnect();
        }
    }
}
