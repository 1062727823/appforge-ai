package com.appforge.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;

@Slf4j
@Service
@RequiredArgsConstructor
public class GitService {

    public record GitResult(int exitCode, String stdout, String stderr) {
    }

    public GitResult runGit(String cwd, String... args) {
        List<String> cmd = new ArrayList<>();
        cmd.add("git");
        cmd.addAll(List.of(args));

        try {
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(new File(cwd));
            pb.redirectErrorStream(true);
            Process process = pb.start();

            String output = new String(process.getInputStream().readAllBytes());
            boolean finished = process.waitFor(60, TimeUnit.SECONDS);
            int exitCode = finished ? process.exitValue() : -1;

            return new GitResult(exitCode, output.trim(), "");
        } catch (IOException | InterruptedException e) {
            return new GitResult(-1, "", e.getMessage());
        }
    }

    public boolean isGitRepository(String cwd) {
        return Files.exists(Path.of(cwd, ".git"));
    }

    public boolean isWorkspaceEmpty(String cwd) {
        File dir = new File(cwd);
        File[] files = dir.listFiles(f -> !f.getName().equals(".git"));
        return files == null || files.length == 0;
    }

    public String syncWorkspaceGit(String appId, String repoUrl, String cwd,
                                   BiConsumer<String, String> onCommand) {
        boolean hasRepoUrl = repoUrl != null && !repoUrl.isBlank();
        boolean isGitRepo = isGitRepository(cwd);
        boolean isEmpty = isWorkspaceEmpty(cwd);
        String action;

        if (hasRepoUrl && isGitRepo) {
            action = "pull";
            onCommand.accept("git pull --ff-only", "Pulling latest changes from remote");
            GitResult r = runGit(cwd, "pull", "--ff-only", "origin");
            if (r.exitCode() != 0) {
                throw new RuntimeException("Git pull failed: " + r.stderr());
            }
            onCommand.accept("git pull", r.stdout());
        } else if (hasRepoUrl && isEmpty) {
            action = "clone";
            onCommand.accept("git clone", "Cloning repository: " + repoUrl);
            GitResult r = runGit(new File(cwd).getParent(), "clone", repoUrl, new File(cwd).getName());
            if (r.exitCode() != 0) {
                throw new RuntimeException("Git clone failed: " + r.stderr());
            }
            onCommand.accept("git clone", r.stdout());
        } else if (hasRepoUrl) {
            action = "init_fetch";
            onCommand.accept("git init", "Initializing git and fetching from remote");
            runGit(cwd, "init");
            runGit(cwd, "remote", "add", "origin", repoUrl);
            GitResult r = runGit(cwd, "fetch", "origin");
            if (r.exitCode() != 0) {
                throw new RuntimeException("Git fetch failed: " + r.stderr());
            }
            String branch = detectRemoteBranch(cwd);
            runGit(cwd, "checkout", "-t", "origin/" + branch);
            onCommand.accept("git fetch", "Fetched from " + repoUrl);
        } else {
            action = "skip";
            onCommand.accept("skip", "No repository URL configured, skipping git operations");
        }

        return action;
    }

    private String detectRemoteBranch(String cwd) {
        GitResult r = runGit(cwd, "remote", "show", "origin");
        for (String line : r.stdout().split("\n")) {
            line = line.trim();
            if (line.startsWith("HEAD branch:")) {
                return line.substring("HEAD branch:".length()).trim();
            }
        }
        return "main";
    }
}
