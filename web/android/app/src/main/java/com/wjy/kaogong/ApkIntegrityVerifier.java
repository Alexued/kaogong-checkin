package com.wjy.kaogong;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

final class ApkIntegrityVerifier {
    private static final int BUFFER_SIZE = 64 * 1024;

    private ApkIntegrityVerifier() {}

    static String normalizeExpectedSha256(String value) {
        if (value == null) return null;
        String normalized = value.trim().toLowerCase(Locale.US);
        if (normalized.startsWith("sha256:")) normalized = normalized.substring(7);
        return normalized.matches("[a-f0-9]{64}") ? normalized : null;
    }

    static String sha256(File file) throws IOException {
        final MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }

        byte[] buffer = new byte[BUFFER_SIZE];
        try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(file), BUFFER_SIZE)) {
            int count;
            while ((count = input.read(buffer)) != -1) {
                digest.update(buffer, 0, count);
            }
        }

        StringBuilder result = new StringBuilder(64);
        for (byte value : digest.digest()) result.append(String.format(Locale.US, "%02x", value & 0xff));
        return result.toString();
    }

    static boolean verifyAndDeleteOnMismatch(File file, String expectedSha256) throws IOException {
        String normalized = normalizeExpectedSha256(expectedSha256);
        if (normalized == null) throw new IllegalArgumentException("A valid SHA-256 digest is required");
        if (normalized.equals(sha256(file))) return true;
        if (file.isFile() && !file.delete()) {
            throw new IOException("Unable to delete an APK that failed SHA-256 verification");
        }
        return false;
    }
}
