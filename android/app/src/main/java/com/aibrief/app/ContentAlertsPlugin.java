package com.aibrief.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Bridge between the web UI (Alerts screen) and the background content checker. */
@CapacitorPlugin(name = "ContentAlerts", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class ContentAlertsPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(ContentSyncWorker.PREFS, Context.MODE_PRIVATE);
    }

    private void resolveGranted(PluginCall call) {
        JSObject out = new JSObject();
        out.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(out);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        SharedPreferences sp = prefs();
        String base = call.getString("baseUrl", "");
        if (base == null) base = "";
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        SharedPreferences.Editor ed = sp.edit();
        if (!base.equals(sp.getString("baseUrl", ""))) {
            // New server: forget what was seen so the first check sets a fresh baseline.
            ed.remove("seen_articles").remove("seen_videos").remove("seen_tutorials");
        }
        ed.putString("baseUrl", base)
            .putBoolean("enabled", enabled)
            .putBoolean("articles", Boolean.TRUE.equals(call.getBoolean("articles", true)))
            .putBoolean("videos", Boolean.TRUE.equals(call.getBoolean("videos", true)))
            .putBoolean("tutorials", Boolean.TRUE.equals(call.getBoolean("tutorials", true)))
            .apply();
        ContentNotifier.ensureChannels(getContext());
        if (enabled && !base.isEmpty()) {
            ContentSyncWorker.schedule(getContext());
        } else {
            ContentSyncWorker.cancel(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void permissionStatus(PluginCall call) {
        resolveGranted(call);
    }

    @PluginMethod
    public void askPermission(PluginCall call) {
        ContentNotifier.ensureChannels(getContext());
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "onNotificationPermission");
            return;
        }
        resolveGranted(call);
    }

    @PermissionCallback
    private void onNotificationPermission(PluginCall call) {
        resolveGranted(call);
    }

    @PluginMethod
    public void checkNow(PluginCall call) {
        ContentSyncWorker.runOnce(getContext());
        call.resolve();
    }

    @PluginMethod
    public void sendTest(PluginCall call) {
        String type = call.getString("type", "articles");
        ContentNotifier.sendTest(getContext(), type == null ? "articles" : type);
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences sp = prefs();
        JSObject out = new JSObject();
        out.put("lastCheck", sp.getLong("lastCheck", 0L));
        out.put("lastResult", sp.getString("lastResult", ""));
        call.resolve(out);
    }

    @PluginMethod
    public void openSystemSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
