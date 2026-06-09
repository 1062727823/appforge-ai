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
        return store.listDeployApps();
    }

    public void addToDeployList(DeployAppEntry entry) {
        store.insertDeployApp(entry);
    }

    public void removeFromDeployList(String appId) {
        store.deleteDeployApp(appId);
    }
}
