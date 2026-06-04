package com.appforge;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan("com.appforge.config")
@EnableAsync
@EnableScheduling
public class AppForgeApplication {

    public static void main(String[] args) {
        SpringApplication.run(AppForgeApplication.class, args);
    }
}
