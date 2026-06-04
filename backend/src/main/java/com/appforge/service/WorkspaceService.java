package com.appforge.service;

import com.appforge.config.AppForgeProperties;
import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkspaceService {

    private final JsonStoreService store;
    private final AppForgeProperties props;

    public record TreeNode(String name, String path, String type, List<TreeNode> children) {
    }

    public List<TreeNode> readTree(String dir) {
        List<TreeNode> result = new ArrayList<>();
        File dirFile = new File(dir);
        File[] entries = dirFile.listFiles();
        if (entries == null) return result;

        Arrays.sort(entries, Comparator.comparing(File::getName));

        for (File entry : entries) {
            String name = entry.getName();
            if (name.equals("node_modules") || name.equals(".git")) continue;

            if (entry.isDirectory()) {
                List<TreeNode> children = readTree(entry.getAbsolutePath());
                result.add(new TreeNode(name, entry.getAbsolutePath(), "directory", children));
            } else {
                result.add(new TreeNode(name, entry.getAbsolutePath(), "file", List.of()));
            }
        }
        return result;
    }

    public String safeJoin(Path base, String target) {
        Path resolved = base.resolve(target).normalize();
        if (!resolved.startsWith(base.normalize())) {
            throw new SecurityException("Path traversal attempt: " + target);
        }
        return resolved.toString();
    }

    public String safeJoin(String base, String target) {
        return safeJoin(Paths.get(base), target);
    }

    public void ensureDir(String dir) throws IOException {
        Files.createDirectories(Paths.get(dir));
    }

    public void writeFile(String path, String content) throws IOException {
        Path p = Paths.get(path);
        Files.createDirectories(p.getParent());
        Files.writeString(p, content);
    }

    public String readFile(String path) throws IOException {
        return Files.readString(Paths.get(path));
    }

    public boolean exists(String path) {
        return Files.exists(Paths.get(path));
    }

    public void deleteDir(String path) throws IOException {
        Path p = Paths.get(path);
        if (Files.exists(p)) {
            try (var stream = Files.walk(p)) {
                stream.sorted(Comparator.reverseOrder())
                        .forEach(entry -> {
                            try {
                                Files.delete(entry);
                            } catch (IOException e) {
                                log.warn("Failed to delete {}", entry, e);
                            }
                        });
            }
        }
    }
}
