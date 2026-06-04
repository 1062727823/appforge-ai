import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { closeAgentSession, getDeployOverview, listApps } from "../lib/api.js";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [view, setView] = useState("dashboard");
  const [apps, setApps] = useState([]);
  const [deployApps, setDeployApps] = useState([]);
  const [deployOverview, setDeployOverview] = useState(new Map());
  const [activeAppId, setActiveAppId] = useState(null);
  const [loadingApps, setLoadingApps] = useState(true);
  const [appsError, setAppsError] = useState("");

  const refreshDeployOverview = useCallback(async () => {
    const payload = await getDeployOverview();
    setDeployOverview(new Map((payload.items || []).map((item) => [item.appId, item])));
    setDeployApps(payload.deployApps || []);
    return payload;
  }, []);

  const refreshApps = useCallback(async () => {
    setLoadingApps(true);
    setAppsError("");
    try {
      const [payload] = await Promise.all([
        listApps(),
        refreshDeployOverview().catch(() => null),
      ]);
      setApps(payload.apps || []);
    } catch (error) {
      setAppsError(error.message || "加载应用失败");
      throw error;
    } finally {
      setLoadingApps(false);
    }
  }, [refreshDeployOverview]);

  useEffect(() => {
    refreshApps().catch(() => {});
  }, [refreshApps]);

  const openEditor = useCallback((appId) => {
    setActiveAppId(appId);
    setView("editor");
  }, []);

  const exitEditor = useCallback(() => {
    const appId = activeAppId;
    if (appId) {
      closeAgentSession(appId).catch(() => {});
    }
    setActiveAppId(null);
    setView("dashboard");
  }, [activeAppId]);

  const getDeployOverviewFor = useCallback(
    (appId) => deployOverview.get(appId) || null,
    [deployOverview],
  );

  const isAppDeployed = useCallback(
    (appId) => {
      const overview = deployOverview.get(appId);
      return Boolean(overview?.running || overview?.deploying);
    },
    [deployOverview],
  );

  const deployListApps = useMemo(() => {
    const appsById = new Map(apps.map((app) => [app.id, app]));
    return deployApps
      .map((entry) => {
        const appId = entry.appId || entry.id;
        const live = appsById.get(appId);
        if (!live) return null;
        return {
          ...live,
          deployAddedAt: entry.addedAt || null,
        };
      })
      .filter(Boolean);
  }, [apps, deployApps]);

  const value = useMemo(
    () => ({
      activeAppId,
      apps,
      appsError,
      deployApps,
      deployListApps,
      deployOverview,
      exitEditor,
      getDeployOverviewFor,
      isAppDeployed,
      loadingApps,
      openEditor,
      refreshApps,
      refreshDeployOverview,
      setView,
      view,
    }),
    [
      activeAppId,
      apps,
      appsError,
      deployApps,
      deployListApps,
      deployOverview,
      exitEditor,
      getDeployOverviewFor,
      isAppDeployed,
      loadingApps,
      openEditor,
      refreshApps,
      refreshDeployOverview,
      view,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
