package com.appforge.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class App {
    private String id;
    private String name;
    private String slug;
    private String description;
    private String repoUrl;
    private String teamName;
    private String visibility;
    private String deployMethod;
    private String status;
    private String createdAt;
    private String updatedAt;
}
