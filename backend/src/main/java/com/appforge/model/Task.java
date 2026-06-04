package com.appforge.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Task {
    private String id;
    private String appId;
    private String type;
    private String status;
    private String prompt;
    private String createdAt;
    private String completedAt;
}
