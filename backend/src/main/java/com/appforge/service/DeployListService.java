package com.appforge.service;

import com.appforge.model.DeployAppEntry;
import com.appforge.store.JsonStoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class DeployListService {

    private final JsonStoreService store;

    public List<DeployAppEntry> getDeployApps() {
        store.readLock();
        try {
            return List.copyOf(store.getState().getDeployApps());
        } finally {
            store.readUnlock();
        }
    }

    public void addToDeployList(DeployAppEntry entry) {
        store.writeLock();
        try {
            store.getState().getDeployApps().add(entry);
            store.saveStore();
        } finally {
            store.writeUnlock();
        }
    }

    public void removeFromDeployList(String appId) {
        store.writeLock();
        try {
            store.getState().getDeployApps().removeIf(d -> d.getAppId().equals(appId));
            store.saveStore();
        } finally {
            store.writeUnlock();
        }
    }
}
