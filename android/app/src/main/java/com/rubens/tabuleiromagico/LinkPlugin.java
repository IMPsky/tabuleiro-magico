package com.rubens.tabuleiromagico;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedReader;
import java.io.Closeable;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Ligação entre dois aparelhos para o Tabuleiro Mágico.
 * - Wi-Fi: quem cria a sala abre um ServerSocket TCP (porta 47800) e mostra o IP local;
 *   o outro jogador conecta digitando esse IP.
 * - Bluetooth: quem cria a sala abre um servidor RFCOMM; o outro escolhe o aparelho na lista.
 * As mensagens são linhas de texto (JSON) terminadas em "\n".
 * Eventos enviados ao JavaScript: connected, data, disconnected, error, btDevice, btScanDone.
 */
@CapacitorPlugin(
    name = "Link",
    permissions = {
        @Permission(alias = "btNew", strings = {
            Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_ADVERTISE
        }),
        @Permission(alias = "btOld", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
@SuppressLint("MissingPermission")
public class LinkPlugin extends Plugin {

    static final UUID BT_UUID = UUID.fromString("6b1c9a4e-3d2f-4c8b-9e7a-5a1d2c3b4e5f");
    static final int DEFAULT_PORT = 47800;

    private final ExecutorService io = Executors.newCachedThreadPool();
    private final ExecutorService writer = Executors.newSingleThreadExecutor();

    private ServerSocket tcpServer;
    private BluetoothServerSocket btServer;
    private volatile Peer peer;
    private BroadcastReceiver scanReceiver;

    /** Uma conexão ativa (TCP ou Bluetooth). */
    private class Peer {
        final Closeable socket;
        final InputStream in;
        final OutputStream out;
        final String via;
        final String address;
        volatile boolean closed = false;

        Peer(Closeable socket, InputStream in, OutputStream out, String via, String address) {
            this.socket = socket; this.in = in; this.out = out; this.via = via; this.address = address;
        }

        void startReading() {
            io.execute(() -> {
                try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = r.readLine()) != null) {
                        JSObject d = new JSObject();
                        d.put("line", line);
                        notifyListeners("data", d);
                    }
                    drop("O outro jogador saiu.");
                } catch (Exception e) {
                    drop("A conexão caiu.");
                }
            });
        }

        void drop(String reason) {
            if (closed) return;
            closed = true;
            try { socket.close(); } catch (Exception ignored) {}
            if (peer == this) peer = null;
            JSObject d = new JSObject();
            d.put("reason", reason);
            d.put("via", via);
            notifyListeners("disconnected", d);
        }
    }

    private void attach(Peer p) {
        Peer old = peer;
        if (old != null && !old.closed) {
            // Já existe alguém conectado: recusa o novo.
            try { p.socket.close(); } catch (Exception ignored) {}
            return;
        }
        peer = p;
        JSObject d = new JSObject();
        d.put("via", p.via);
        d.put("address", p.address);
        notifyListeners("connected", d);
        p.startReading();
    }

    private void emitError(String msg) {
        JSObject d = new JSObject();
        d.put("message", msg);
        notifyListeners("error", d);
    }

    // ------------------------------------------------------------------ Wi-Fi / IP

    @PluginMethod
    public void getLocalIp(PluginCall call) {
        String best = null;
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    String ip = a.getHostAddress();
                    String name = ni.getName() == null ? "" : ni.getName();
                    // Prefere a interface Wi-Fi (wlan) ou hotspot (ap/swlan).
                    if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan")) { best = ip; break; }
                    if (best == null && a.isSiteLocalAddress()) best = ip;
                }
                if (best != null && (ni.getName() + "").startsWith("wlan")) break;
            }
        } catch (Exception e) {
            call.reject("Não foi possível ler o IP do aparelho.");
            return;
        }
        JSObject r = new JSObject();
        r.put("ip", best);
        r.put("port", DEFAULT_PORT);
        call.resolve(r);
    }

    @PluginMethod
    public void tcpHost(PluginCall call) {
        final int port = call.getInt("port", DEFAULT_PORT);
        stopServers();
        try {
            tcpServer = new ServerSocket();
            tcpServer.setReuseAddress(true);
            tcpServer.bind(new InetSocketAddress(port));
        } catch (Exception e) {
            call.reject("Não foi possível abrir a sala na porta " + port + ". Feche outras salas e tente de novo.");
            return;
        }
        final ServerSocket server = tcpServer;
        io.execute(() -> {
            while (!server.isClosed()) {
                try {
                    Socket s = server.accept();
                    s.setTcpNoDelay(true);
                    attach(new Peer(s, s.getInputStream(), s.getOutputStream(), "tcp", s.getInetAddress().getHostAddress()));
                } catch (Exception e) {
                    if (!server.isClosed()) emitError("Falha ao aceitar conexão.");
                }
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void tcpJoin(PluginCall call) {
        final String ip = call.getString("ip");
        final int port = call.getInt("port", DEFAULT_PORT);
        if (ip == null || ip.trim().isEmpty()) { call.reject("Digite o IP da sala."); return; }
        io.execute(() -> {
            try {
                Socket s = new Socket();
                s.connect(new InetSocketAddress(ip.trim(), port), 6000);
                s.setTcpNoDelay(true);
                attach(new Peer(s, s.getInputStream(), s.getOutputStream(), "tcp", ip.trim()));
                call.resolve();
            } catch (Exception e) {
                call.reject("Não encontrei uma sala nesse IP. Confira o número e se os dois estão no mesmo Wi-Fi.");
            }
        });
    }

    // ------------------------------------------------------------------ Bluetooth

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    private String btAlias() { return Build.VERSION.SDK_INT >= 31 ? "btNew" : "btOld"; }

    @PluginMethod
    public void btPermissions(PluginCall call) {
        if (getPermissionState(btAlias()) == PermissionState.GRANTED) {
            JSObject r = new JSObject(); r.put("granted", true); call.resolve(r);
        } else {
            requestPermissionForAlias(btAlias(), call, "btPermsCallback");
        }
    }

    @PermissionCallback
    private void btPermsCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState(btAlias()) == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void btStatus(PluginCall call) {
        BluetoothAdapter a = adapter();
        JSObject r = new JSObject();
        r.put("available", a != null);
        r.put("enabled", a != null && a.isEnabled());
        r.put("granted", getPermissionState(btAlias()) == PermissionState.GRANTED);
        call.resolve(r);
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void btEnable(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("Este aparelho não tem Bluetooth."); return; }
        if (!a.isEnabled()) {
            Intent i = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void btDiscoverable(PluginCall call) {
        Intent i = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
        i.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 300);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void btHost(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("Este aparelho não tem Bluetooth."); return; }
        if (!a.isEnabled()) { call.reject("Ligue o Bluetooth para criar a sala."); return; }
        if (getPermissionState(btAlias()) != PermissionState.GRANTED) { call.reject("Permita o uso do Bluetooth para criar a sala."); return; }
        stopServers();
        try {
            btServer = a.listenUsingRfcommWithServiceRecord("TabuleiroMagico", BT_UUID);
        } catch (Exception e) {
            call.reject("Não foi possível abrir a sala por Bluetooth.");
            return;
        }
        final BluetoothServerSocket server = btServer;
        io.execute(() -> {
            while (btServer == server) {
                try {
                    BluetoothSocket s = server.accept();
                    BluetoothDevice d = s.getRemoteDevice();
                    attach(new Peer(s, s.getInputStream(), s.getOutputStream(), "bt", d.getAddress()));
                } catch (Exception e) {
                    break;
                }
            }
        });
        JSObject r = new JSObject();
        String name = null;
        try { name = a.getName(); } catch (Exception ignored) {}
        r.put("name", name);
        call.resolve(r);
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void btPaired(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("Este aparelho não tem Bluetooth."); return; }
        JSArray list = new JSArray();
        try {
            for (BluetoothDevice d : a.getBondedDevices()) {
                JSObject o = new JSObject();
                o.put("name", d.getName());
                o.put("address", d.getAddress());
                list.put(o);
            }
        } catch (Exception e) {
            call.reject("Permita o uso do Bluetooth para ver os aparelhos.");
            return;
        }
        JSObject r = new JSObject();
        r.put("devices", list);
        call.resolve(r);
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void btScan(PluginCall call) {
        BluetoothAdapter a = adapter();
        if (a == null) { call.reject("Este aparelho não tem Bluetooth."); return; }
        stopScanReceiver();
        scanReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String action = intent.getAction();
                if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                    BluetoothDevice d = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (d == null) return;
                    JSObject o = new JSObject();
                    try { o.put("name", d.getName()); } catch (Exception ignored) {}
                    o.put("address", d.getAddress());
                    notifyListeners("btDevice", o);
                } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                    notifyListeners("btScanDone", new JSObject());
                    stopScanReceiver();
                }
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(BluetoothDevice.ACTION_FOUND);
        f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        ContextCompat.registerReceiver(getContext(), scanReceiver, f, ContextCompat.RECEIVER_EXPORTED);
        try {
            if (a.isDiscovering()) a.cancelDiscovery();
            if (!a.startDiscovery()) { call.reject("Não foi possível procurar aparelhos. Ligue o Bluetooth e a localização."); return; }
        } catch (Exception e) {
            call.reject("Permita o uso do Bluetooth para procurar aparelhos.");
            return;
        }
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void btJoin(PluginCall call) {
        final String address = call.getString("address");
        BluetoothAdapter a = adapter();
        if (a == null || address == null) { call.reject("Escolha um aparelho."); return; }
        io.execute(() -> {
            try {
                try { a.cancelDiscovery(); } catch (Exception ignored) {}
                BluetoothDevice d = a.getRemoteDevice(address);
                BluetoothSocket s = d.createRfcommSocketToServiceRecord(BT_UUID);
                s.connect();
                attach(new Peer(s, s.getInputStream(), s.getOutputStream(), "bt", address));
                call.resolve();
            } catch (Exception e) {
                call.reject("Não consegui conectar. Confira se o outro aparelho abriu a sala por Bluetooth.");
            }
        });
    }

    // ------------------------------------------------------------------ comum

    @PluginMethod
    public void send(PluginCall call) {
        final String data = call.getString("data");
        final Peer p = peer;
        if (p == null || p.closed) { call.reject("Sem conexão com o outro jogador."); return; }
        writer.execute(() -> {
            try {
                p.out.write((data + "\n").getBytes(StandardCharsets.UTF_8));
                p.out.flush();
                call.resolve();
            } catch (Exception e) {
                p.drop("A conexão caiu.");
                call.reject("Não foi possível enviar a jogada.");
            }
        });
    }

    /** Fecha só a conexão com o outro jogador (a sala continua aberta). */
    @PluginMethod
    public void disconnect(PluginCall call) {
        Peer p = peer;
        if (p != null) p.drop("Conexão encerrada.");
        call.resolve();
    }

    /** Fecha tudo: conexão e sala. */
    @PluginMethod
    public void close(PluginCall call) {
        Peer p = peer;
        if (p != null) p.drop("Conexão encerrada.");
        stopServers();
        stopScanReceiver();
        call.resolve();
    }

    private void stopServers() {
        try { if (tcpServer != null) tcpServer.close(); } catch (Exception ignored) {}
        tcpServer = null;
        BluetoothServerSocket b = btServer;
        btServer = null;
        try { if (b != null) b.close(); } catch (Exception ignored) {}
    }

    private void stopScanReceiver() {
        if (scanReceiver != null) {
            try { getContext().unregisterReceiver(scanReceiver); } catch (Exception ignored) {}
            scanReceiver = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        Peer p = peer;
        if (p != null) p.drop("Aplicativo fechado.");
        stopServers();
        stopScanReceiver();
        io.shutdownNow();
        writer.shutdownNow();
    }
}
