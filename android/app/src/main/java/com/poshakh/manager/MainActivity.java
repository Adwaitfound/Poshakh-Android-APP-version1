package com.poshakh.manager;

import android.os.Bundle;
import android.graphics.Color;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Ensure content is laid out below status bar (no overlap on scroll)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        // Match the app theme color for status bar
        getWindow().setStatusBarColor(Color.parseColor("#084734"));
        // Use light icons on dark status bar
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(
                getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
    }
}
