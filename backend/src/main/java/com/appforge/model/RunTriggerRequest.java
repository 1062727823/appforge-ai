package com.appforge.model;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class RunTriggerRequest {
    @NotBlank
    private String action;
}
