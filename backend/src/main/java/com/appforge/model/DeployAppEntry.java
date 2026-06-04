package com.appforge.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeployAppEntry {
    private String appId;
    private String name;
    private String slug;
    private String teamName;
    private String deployMethod;
    private String status;
    private String addedAt;
}
