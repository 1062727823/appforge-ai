package com.appforge.model;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateAppRequest {
    @Size(min = 1, max = 80)
    private String name;

    @Size(max = 4000)
    private String description;

    private String repoUrl;
    private String teamName;
    private String visibility;
}
