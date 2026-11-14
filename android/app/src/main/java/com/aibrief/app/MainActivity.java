package com.aibrief.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContentAlertsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
