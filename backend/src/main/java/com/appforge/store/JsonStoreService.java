package com.appforge.store;

import com.appforge.config.AppForgeProperties;
import com.appforge.model.AppState;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.locks.ReentrantReadWriteLock;

@Slf4j
@Service
public class JsonStoreService {

    private final AppForgeProperties props;
    private final ObjectMapper mapper;
    private final ReentrantReadWriteLock lock;
    @Getter
    private AppState state;

    public JsonStoreService(AppForgeProperties props) {
        this.props = props;
        this.mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
        this.lock = new ReentrantReadWriteLock();
    }

    @PostConstruct
    public void ensureStore() {
        Path dbFile = Paths.get(props.getStorePath());
        if (Files.exists(dbFile)) {
            lock.readLock().lock();
            try {
                state = mapper.readValue(dbFile.toFile(), AppState.class);
                log.info("Loaded store from {}", dbFile);
            } catch (IOException e) {
                log.warn("Failed to load store, creating fresh: {}", e.getMessage());
                state = createInitialState();
            } finally {
                lock.readLock().unlock();
            }
        } else {
            lock.writeLock().lock();
            try {
                Files.createDirectories(dbFile.getParent());
                state = createInitialState();
                saveStateLocked();
                log.info("Created new store at {}", dbFile);
            } catch (IOException e) {
                throw new RuntimeException("Failed to initialize store", e);
            } finally {
                lock.writeLock().unlock();
            }
        }
    }

    public void saveStore() {
        lock.writeLock().lock();
        try {
            saveStateLocked();
        } finally {
            lock.writeLock().unlock();
        }
    }

    private void saveStateLocked() {
        try {
            mapper.writeValue(new File(props.getStorePath()), state);
        } catch (IOException e) {
            throw new RuntimeException("Failed to save store", e);
        }
    }

    public void readLock() {
        lock.readLock().lock();
    }

    public void readUnlock() {
        lock.readLock().unlock();
    }

    public void writeLock() {
        lock.writeLock().lock();
    }

    public void writeUnlock() {
        lock.writeLock().unlock();
    }

    public String appWorkspace(String appId) {
        return props.getAppWorkspace(appId);
    }

    private AppState createInitialState() {
        return AppState.builder().build();
    }
}
