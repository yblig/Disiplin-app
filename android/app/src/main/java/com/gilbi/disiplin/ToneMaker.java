package com.gilbi.disiplin;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/** Membuat file WAV nada alarm bawaan (sirine, beep, kokok) satu kali lalu disimpan. */
final class ToneMaker {
    private static final int SR = 44100;

    private ToneMaker() {}

    static File get(Context c, String kind) throws IOException {
        if (!"beep".equals(kind) && !"rooster".equals(kind)) kind = "siren";
        File f = new File(c.getFilesDir(), "tone_" + kind + "_v1.wav");
        if (f.exists() && f.length() > 1000) return f;
        short[] pcm;
        switch (kind) {
            case "beep": pcm = beep(); break;
            case "rooster": pcm = rooster(); break;
            default: pcm = siren();
        }
        writeWav(f, pcm);
        return f;
    }

    private static short s(double v) {
        double x = Math.tanh(v * 1.6) / Math.tanh(1.6); // soft clip, keras tapi tidak pecah
        return (short) Math.round(x * 32000);
    }

    private static short[] siren() {
        int n = SR * 4; // 2 siklus LFO 0.5 Hz -> loop mulus
        short[] out = new short[n];
        double ph = 0;
        for (int i = 0; i < n; i++) {
            double t = (double) i / SR;
            double f = 950 + 450 * Math.sin(2 * Math.PI * 0.5 * t);
            ph += f / SR;
            ph -= Math.floor(ph);
            out[i] = s((ph * 2 - 1) * 0.9);
        }
        return out;
    }

    private static short[] beep() {
        int n = (int) (SR * 1.1);
        short[] out = new short[n];
        for (int i = 0; i < n; i++) {
            double t = (double) i / SR;
            double within = t % 0.18;
            boolean on = t < 0.72 && within < 0.1;
            double sq = Math.sin(2 * Math.PI * 1046 * t) >= 0 ? 1 : -1;
            out[i] = on ? s(sq * 0.8) : 0;
        }
        return out;
    }

    private static short[] rooster() {
        int n = SR * 2;
        short[] out = new short[n];
        double ph = 0;
        double[][] pts = {{0, 500}, {0.25, 1300}, {0.6, 1100}, {1.0, 1500}, {1.4, 600}};
        for (int i = 0; i < n; i++) {
            double t = (double) i / SR;
            if (t >= 1.5) { out[i] = 0; continue; }
            double f = 600;
            for (int k = 0; k < pts.length - 1; k++) {
                if (t >= pts[k][0] && t < pts[k + 1][0]) {
                    double r = (t - pts[k][0]) / (pts[k + 1][0] - pts[k][0]);
                    f = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * r;
                }
            }
            ph += f / SR;
            ph -= Math.floor(ph);
            double env = t > 1.4 ? (1.5 - t) / 0.1 : 1;
            out[i] = s((ph < 0.5 ? 1 : -1) * 0.8 * env);
        }
        return out;
    }

    private static void writeWav(File f, short[] pcm) throws IOException {
        int dataLen = pcm.length * 2;
        byte[] b = new byte[44 + dataLen];
        put(b, 0, "RIFF"); le32(b, 4, 36 + dataLen); put(b, 8, "WAVE");
        put(b, 12, "fmt "); le32(b, 16, 16); le16(b, 20, 1); le16(b, 22, 1);
        le32(b, 24, SR); le32(b, 28, SR * 2); le16(b, 32, 2); le16(b, 34, 16);
        put(b, 36, "data"); le32(b, 40, dataLen);
        for (int i = 0; i < pcm.length; i++) le16(b, 44 + i * 2, pcm[i]);
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(b); }
    }

    private static void put(byte[] b, int o, String s) {
        for (int i = 0; i < 4; i++) b[o + i] = (byte) s.charAt(i);
    }

    private static void le16(byte[] b, int o, int v) {
        b[o] = (byte) v; b[o + 1] = (byte) (v >> 8);
    }

    private static void le32(byte[] b, int o, int v) {
        b[o] = (byte) v; b[o + 1] = (byte) (v >> 8); b[o + 2] = (byte) (v >> 16); b[o + 3] = (byte) (v >> 24);
    }
}
