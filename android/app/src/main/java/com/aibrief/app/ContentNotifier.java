package com.aibrief.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.List;
import org.json.JSONObject;

/** Builds and posts "new content" notifications. One channel per content type so people can tune each in system settings. */
public final class ContentNotifier {
    private ContentNotifier() {}

    static String channelId(String key) { return "new_" + key; }

    static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        String[][] defs = {
            {"articles", "New articles", "News, explainers and tool spotlights"},
            {"videos", "New videos", "Newly reviewed videos"},
            {"tutorials", "New tutorials", "Step-by-step guides for AI tools"}
        };
        for (String[] d : defs) {
            NotificationChannel ch = new NotificationChannel(channelId(d[0]), d[1], NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription(d[2]);
            nm.createNotificationChannel(ch);
        }
    }

    private static PendingIntent open(Context ctx, String route, int code) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("aibrief://open" + route), ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void post(Context ctx, String key, int id, String title, String text, NotificationCompat.Style style, String route) {
        ensureChannels(ctx);
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (!nm.areNotificationsEnabled()) return;
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, channelId(key))
            .setSmallIcon(R.drawable.ic_stat_brief)
            .setColor(0xFF047857)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(style)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(open(ctx, route, id));
        try {
            nm.notify(id, b.build());
        } catch (SecurityException ignored) {
            // Permission was revoked between the check and the post.
        }
    }

    /** t = {key, endpoint, singular, plural, detailRoute, listRoute} */
    static void announce(Context ctx, String[] t, List<JSONObject> fresh) {
        if (fresh.size() <= 3) {
            for (JSONObject o : fresh) {
                String title = o.optString("title", "Something new on AI Brief");
                String body = o.optString("summary", o.optString("aiReview", o.optString("channelName", "")));
                if (body.length() > 280) body = body.substring(0, 277) + "...";
                String slug = o.optString("slug", "");
                String route = slug.isEmpty() ? t[5] : t[4] + slug;
                String id = o.optString("id", slug);
                post(ctx, t[0], (t[0] + id).hashCode(), "New " + t[2] + ": " + title,
                    body.isEmpty() ? "Tap to open it in AI Brief" : body,
                    new NotificationCompat.BigTextStyle().bigText(body.isEmpty() ? title : body), route);
            }
            return;
        }
        NotificationCompat.InboxStyle inbox = new NotificationCompat.InboxStyle();
        for (int i = 0; i < Math.min(5, fresh.size()); i++) inbox.addLine(fresh.get(i).optString("title", ""));
        post(ctx, t[0], t[0].hashCode(), fresh.size() + " new " + t[3] + " on AI Brief",
            fresh.get(0).optString("title", "Tap to see what is new"), inbox, t[5]);
    }

    static void sendTest(Context ctx, String key) {
        String route = "videos".equals(key) ? "/videos" : "tutorials".equals(key) ? "/guides" : "/articles";
        String label = "videos".equals(key) ? "video" : "tutorials".equals(key) ? "tutorial" : "article";
        String body = "This is how AI Brief will let you know. Tap to open the latest " + label + "s.";
        post(ctx, ("videos".equals(key) || "tutorials".equals(key)) ? key : "articles", 424242,
            "Test alert: a new " + label + " just landed", body, new NotificationCompat.BigTextStyle().bigText(body), route);
    }
}
