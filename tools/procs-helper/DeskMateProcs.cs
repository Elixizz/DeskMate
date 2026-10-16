// DeskMate process lister: a tiny helper that DeskMate keeps running while a Mate with the "processes" permission is
// open. Each "list" line on stdin gets one JSON line back describing every process. It only reads; ending programs
// is done by DeskMate itself after you confirm.
//
// Build (no SDK needed, the compiler ships with Windows):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /optimize+
//     /out:host\bin\dm-procs.exe tools\procs-helper\DeskMateProcs.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

static class DeskMateProcs {
  const uint QUERY_LIMITED = 0x1000;

  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder name, ref int size);
  [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr h, out long create, out long exit, out long kernel, out long user);
  [DllImport("kernel32.dll")] static extern bool ProcessIdToSessionId(int pid, out int session);
  [DllImport("psapi.dll")] static extern bool GetProcessMemoryInfo(IntPtr h, out MEM counters, int size);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr w);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr w, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr w, int index);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr w, StringBuilder s, int max);
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr w, out int pid);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr w, int attr, out int val, int size);
  delegate bool EnumProc(IntPtr w, IntPtr p);

  [StructLayout(LayoutKind.Sequential)]
  struct MEM { public int cb; public int PageFaultCount; public IntPtr PeakWorkingSetSize, WorkingSetSize, QuotaPeakPagedPoolUsage, QuotaPagedPoolUsage, QuotaPeakNonPagedPoolUsage, QuotaNonPagedPoolUsage, PagefileUsage, PeakPagefileUsage, PrivateUsage; }

  static readonly Dictionary<string, string> descCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

  // Windows that show up on the taskbar: visible, not owned, not tool windows, not cloaked, with a title.
  static Dictionary<int, string> Windows() {
    var map = new Dictionary<int, string>();
    EnumWindows((w, p) => {
      if (!IsWindowVisible(w) || GetWindow(w, 4) != IntPtr.Zero) return true;
      int ex = GetWindowLong(w, -20);
      if ((ex & 0x80) != 0) return true; // WS_EX_TOOLWINDOW
      int cloaked; if (DwmGetWindowAttribute(w, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      var sb = new StringBuilder(256); GetWindowText(w, sb, 256);
      if (sb.Length == 0) return true;
      int pid; GetWindowThreadProcessId(w, out pid);
      if (!map.ContainsKey(pid)) map[pid] = sb.ToString();
      return true;
    }, IntPtr.Zero);
    return map;
  }

  static string Esc(string s) {
    if (s == null) return "null";
    var b = new StringBuilder("\"");
    foreach (char c in s) {
      if (c == '"' || c == '\\') b.Append('\\').Append(c);
      else if (c < 0x20) b.AppendFormat("\\u{0:x4}", (int)c);
      else b.Append(c);
    }
    return b.Append('"').ToString();
  }

  static string Describe(string path) {
    if (path == null) return null;
    string d;
    if (descCache.TryGetValue(path, out d)) return d;
    try { d = FileVersionInfo.GetVersionInfo(path).FileDescription; } catch { d = null; }
    if (d != null) d = d.Trim();
    if (d == "") d = null;
    descCache[path] = d;
    return d;
  }

  static string List() {
    var wins = Windows();
    var sb = new StringBuilder("{\"me\":");
    int mySession; ProcessIdToSessionId(Process.GetCurrentProcess().Id, out mySession);
    sb.Append(mySession).Append(",\"t\":").Append(DateTime.UtcNow.Ticks / 10000).Append(",\"procs\":[");
    bool first = true;
    foreach (var p in Process.GetProcesses()) {
      int pid = p.Id;
      if (pid == 0) { p.Dispose(); continue; }
      string name = p.ProcessName, path = null; long cpu = -1, mem = -1; int session = -1;
      ProcessIdToSessionId(pid, out session);
      IntPtr h = OpenProcess(QUERY_LIMITED, false, pid);
      if (h != IntPtr.Zero) {
        var b = new StringBuilder(1024); int size = 1024;
        if (QueryFullProcessImageName(h, 0, b, ref size)) path = b.ToString();
        long c, e, k, u; if (GetProcessTimes(h, out c, out e, out k, out u)) cpu = (k + u) / 10000; // ms
        MEM m; if (GetProcessMemoryInfo(h, out m, Marshal.SizeOf(typeof(MEM)))) mem = (long)m.PrivateUsage;
        CloseHandle(h);
      }
      p.Dispose();
      string title; wins.TryGetValue(pid, out title);
      if (!first) sb.Append(',');
      first = false;
      sb.Append("{\"p\":").Append(pid).Append(",\"n\":").Append(Esc(name)).Append(",\"s\":").Append(session)
        .Append(",\"f\":").Append(Esc(path)).Append(",\"d\":").Append(Esc(Describe(path)))
        .Append(",\"c\":").Append(cpu).Append(",\"m\":").Append(mem).Append(",\"w\":").Append(Esc(title)).Append('}');
    }
    return sb.Append("]}").ToString();
  }

  static void Main() {
    Console.OutputEncoding = new UTF8Encoding(false);
    Console.InputEncoding = new UTF8Encoding(false);
    string line;
    while ((line = Console.ReadLine()) != null) {
      if (line.Trim() != "list") continue;
      string outp;
      try { outp = List(); } catch (Exception ex) { outp = "{\"error\":" + Esc(ex.Message) + "}"; }
      Console.Out.WriteLine(outp);
      Console.Out.Flush();
    }
  }
}
