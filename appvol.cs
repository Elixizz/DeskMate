// Per-app volume via Windows Core Audio sessions (the same thing as the Volume Mixer).
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class AppVol
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints();
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    }

    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        int GetAudioSessionControl();
        int GetSimpleAudioVolume();
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
    }

    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
    }

    [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        // IAudioSessionControl (9 methods we don't use)
        int GetState(); int GetDisplayName(); int SetDisplayName(); int GetIconPath(); int SetIconPath();
        int GetGroupingParam(); int SetGroupingParam(); int RegisterAudioSessionNotification(); int UnregisterAudioSessionNotification();
        // IAudioSessionControl2
        int GetSessionIdentifier(); int GetSessionInstanceIdentifier();
        [PreserveSig] int GetProcessId(out uint pid);
    }

    [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume
    {
        [PreserveSig] int SetMasterVolume(float level, ref Guid eventContext);
        [PreserveSig] int GetMasterVolume(out float level);
    }

    // Applies to every audio session owned by a process with this name (e.g. "opera").
    // level < 0 means read only. Returns the first matching session's volume, or -1 if none.
    public static float Volume(string processName, float level)
    {
        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        IMMDevice device;
        if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0) return -1;
        Guid iid = typeof(IAudioSessionManager2).GUID;
        object o;
        if (device.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) return -1;
        IAudioSessionEnumerator sessions;
        ((IAudioSessionManager2)o).GetSessionEnumerator(out sessions);
        int count; sessions.GetCount(out count);
        float found = -1;
        Guid ctx = Guid.Empty;
        for (int i = 0; i < count; i++)
        {
            IAudioSessionControl2 s;
            if (sessions.GetSession(i, out s) != 0) continue;
            uint pid; s.GetProcessId(out pid);
            string name;
            try { name = Process.GetProcessById((int)pid).ProcessName; } catch { continue; }
            if (!string.Equals(name, processName, StringComparison.OrdinalIgnoreCase)) continue;
            var vol = (ISimpleAudioVolume)s;
            if (level >= 0) vol.SetMasterVolume(Math.Min(1f, level), ref ctx);
            float cur; vol.GetMasterVolume(out cur);
            if (found < 0) found = cur;
        }
        return found;
    }
}
