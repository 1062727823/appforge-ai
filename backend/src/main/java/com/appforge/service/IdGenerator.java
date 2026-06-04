package com.appforge.service;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;

@Service
public class IdGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();

    public String createId(String prefix) {
        byte[] bytes = new byte[8];
        RANDOM.nextBytes(bytes);
        StringBuilder hex = new StringBuilder();
        for (byte b : bytes) {
            hex.append(String.format("%02x", b));
        }
        return prefix + "_" + hex;
    }

    public String now() {
        return java.time.Instant.now().toString();
    }
}
