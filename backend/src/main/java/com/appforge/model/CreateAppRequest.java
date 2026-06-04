package com.appforge.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateAppRequest {
    @NotBlank
    @Size(min = 1, max = 80)
    private String name;

    @NotBlank
    @Pattern(regexp = "^[a-z0-9][a-z0-9-]*[a-z0-9]$")
    private String slug;

    @Size(max = 4000)
    private String description;

    private String repoUrl;
    private String teamName;
    private String visibility;
    private String deployMethod;
}
