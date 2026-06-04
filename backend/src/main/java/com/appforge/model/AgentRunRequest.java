package com.appforge.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AgentRunRequest {
    @NotBlank
    @Size(min = 1, max = 12000)
    private String prompt;

    @Size(max = 500)
    private String activeFile;
}
