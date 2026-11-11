// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useNotificacoesPush } from "./useNotificacoesPush";

const mockToast = vi.fn();

vi.mock("@/shared/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (...args: unknown[]) => mockToast(...args),
  }),
}));

vi.mock("@/core/logging/LoggerService", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

interface MockPushSubscription {
  endpoint: string;
  options: { applicationServerKey?: ArrayBuffer };
  toJSON: () => { keys: { p256dh: string; auth: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
}

function createSubscription(endpoint = "https://fcm.googleapis.com/fcm/send/sub-1"): MockPushSubscription {
  return {
    endpoint,
    options: {},
    toJSON: () => ({ keys: { p256dh: "p256dh-key", auth: "auth-secret" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

function createPushSubscriptionsMock(options?: {
  existing?: { id: string } | null;
  insertErrors?: Array<{ code: string; message: string } | null>;
}) {
  const insertQueue = [...(options?.insertErrors ?? [null])];
  const insertMock = vi.fn().mockImplementation(async () => ({
    error: insertQueue.length > 0 ? insertQueue.shift() : null,
  }));
  const updateEqMock = vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
  const maybeSingleMock = vi.fn().mockResolvedValue({
    data: options?.existing ?? null,
    error: null,
  });
  const selectEqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: selectEqMock });

  mockFrom.mockReturnValue({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  });

  return { insertMock, updateMock, maybeSingleMock };
}

describe("useNotificacoesPush", () => {
  let permissionValue: NotificationPermission;
  let requestPermissionMock: ReturnType<typeof vi.fn>;
  let currentSub: MockPushSubscription | null;
  let subscribeMock: ReturnType<typeof vi.fn>;
  let getSubscriptionMock: ReturnType<typeof vi.fn>;
  let registerMock: ReturnType<typeof vi.fn>;
  let permListeners: Map<string, Set<() => void>>;
  let permissionsQueryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    permissionValue = "default";
    currentSub = null;
    permListeners = new Map();

    mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    createPushSubscriptionsMock();

    requestPermissionMock = vi.fn().mockImplementation(async () => permissionValue);
    subscribeMock = vi.fn().mockImplementation(async () => {
      const sub = createSubscription();
      currentSub = sub;
      return sub;
    });
    getSubscriptionMock = vi.fn().mockImplementation(async () => currentSub);

    const mockReg = {
      pushManager: {
        getSubscription: getSubscriptionMock,
        subscribe: subscribeMock,
      },
      showNotification: vi.fn().mockResolvedValue(undefined),
    };

    registerMock = vi.fn().mockResolvedValue(mockReg);

    Object.defineProperty(window, "Notification", {
      configurable: true,
      writable: true,
      value: {
        get permission() {
          return permissionValue;
        },
        requestPermission: requestPermissionMock,
      },
    });

    Object.defineProperty(window, "PushManager", {
      configurable: true,
      writable: true,
      value: function PushManager() {},
    });

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: registerMock,
        ready: Promise.resolve(mockReg),
      },
    });

    const mockPermissionStatus = {
      state: "prompt",
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (!permListeners.has(event)) permListeners.set(event, new Set());
        permListeners.get(event)!.add(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: () => void) => {
        permListeners.get(event)?.delete(cb);
      }),
    };

    permissionsQueryMock = vi.fn().mockResolvedValue(mockPermissionStatus);
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: permissionsQueryMock,
      },
    });
  });

  it("não acusa 'Permissão negada' quando navegador fecha ou silencia o pedido ('default')", async () => {
    permissionValue = "default";
    requestPermissionMock.mockResolvedValue("default");

    const { result } = renderHook(() => useNotificacoesPush());

    let ok = true;
    await act(async () => {
      ok = await result.current.registerPush();
    });

    expect(ok).toBe(false);
    expect(result.current.permission).toBe("default");
    expect(result.current.promptDismissed).toBe(true);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Confirmação pendente no navegador",
      })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Permissão negada",
      })
    );
  });

  it("exibe instrução de desbloqueio quando Notification.permission é 'denied'", async () => {
    permissionValue = "denied";

    const { result } = renderHook(() => useNotificacoesPush());

    let ok = true;
    await act(async () => {
      ok = await result.current.registerPush();
    });

    expect(ok).toBe(false);
    expect(result.current.permission).toBe("denied");
    expect(result.current.promptDismissed).toBe(false);
    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Notificações bloqueadas no navegador",
        variant: "destructive",
      })
    );
  });

  it("ativa notificações e salva subscription quando permissão é concedida", async () => {
    requestPermissionMock.mockImplementation(async () => {
      permissionValue = "granted";
      return "granted";
    });
    const { insertMock } = createPushSubscriptionsMock();

    const { result } = renderHook(() => useNotificacoesPush());

    let ok = false;
    await act(async () => {
      ok = await result.current.registerPush();
    });

    expect(ok).toBe(true);
    expect(result.current.permission).toBe("granted");
    expect(result.current.isSubscribed).toBe(true);
    expect(registerMock).toHaveBeenCalledWith("/sw.js");
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        endpoint: "https://fcm.googleapis.com/fcm/send/sub-1",
      })
    );
  });

  it("refaz subscription automaticamente ao receber InvalidStateError por chave VAPID antiga", async () => {
    const oldSub = createSubscription("https://fcm.googleapis.com/fcm/send/old-sub");
    const newSub = createSubscription("https://fcm.googleapis.com/fcm/send/new-sub");
    currentSub = oldSub;

    requestPermissionMock.mockImplementation(async () => {
      permissionValue = "granted";
      return "granted";
    });

    subscribeMock
      .mockRejectedValueOnce(new DOMException("Different applicationServerKey", "InvalidStateError"))
      .mockResolvedValueOnce(newSub);

    const { insertMock } = createPushSubscriptionsMock();
    const { result } = renderHook(() => useNotificacoesPush());

    let ok = false;
    await act(async () => {
      ok = await result.current.registerPush();
    });

    expect(ok).toBe(true);
    expect(oldSub.unsubscribe).toHaveBeenCalledTimes(2);
    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://fcm.googleapis.com/fcm/send/new-sub",
      })
    );
  });

  it("renova endpoint automaticamente quando insert falha com conflito 23505 de outro usuário", async () => {
    const firstSub = createSubscription("https://fcm.googleapis.com/fcm/send/shared-sub");
    const freshSub = createSubscription("https://fcm.googleapis.com/fcm/send/fresh-sub");

    requestPermissionMock.mockImplementation(async () => {
      permissionValue = "granted";
      return "granted";
    });

    subscribeMock.mockResolvedValueOnce(firstSub).mockResolvedValueOnce(freshSub);
    const { insertMock } = createPushSubscriptionsMock({
      insertErrors: [{ code: "23505", message: "duplicate key value violates unique constraint" }, null],
    });

    const { result } = renderHook(() => useNotificacoesPush());

    let ok = false;
    await act(async () => {
      ok = await result.current.registerPush();
    });

    expect(ok).toBe(true);
    expect(firstSub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: "https://fcm.googleapis.com/fcm/send/fresh-sub",
      })
    );
  });

  it("sincroniza alteração de permissão feita externamente via Permissions API", async () => {
    const { result } = renderHook(() => useNotificacoesPush());

    await waitFor(() => {
      expect(permissionsQueryMock).toHaveBeenCalledWith({ name: "notifications" });
    });

    expect(result.current.permission).toBe("default");

    await act(async () => {
      permissionValue = "granted";
      permListeners.get("change")?.forEach((cb) => cb());
    });

    await waitFor(() => {
      expect(result.current.permission).toBe("granted");
    });
  });
});
