// DeskMate web installer: a tiny exe that always installs the newest DeskMate.
// It reads https://deskmate.lapistudios.com/update.json, downloads the installer it names, checks the sha256,
// and runs it. Nothing is pinned to a version, so this file never needs rebuilding for a new release.
//
// Build (no SDK needed, the compiler ships with Windows):
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe /optimize+
//     /win32icon:build\icon.ico /out:dist\DeskMate-Installer.exe tools\web-installer\DeskMateInstaller.cs
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("DeskMate Installer")]
[assembly: System.Reflection.AssemblyProduct("DeskMate")]
[assembly: System.Reflection.AssemblyCompany("Lapis Studios")]
[assembly: System.Reflection.AssemblyCopyright("Lapis Studios")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

static class DeskMateInstaller
{
    const string UpdateUrl = "https://deskmate.lapistudios.com/update.json";
    static readonly string[] AllowedHosts = { "deskmate.lapistudios.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com" };

    static Form form;
    static Label status;
    static ProgressBar bar;
    static Button button;
    static bool dryRun; // --dry-run: do everything except start the installer (for testing)

    [STAThread]
    static void Main(string[] args)
    {
        dryRun = Array.IndexOf(args, "--dry-run") >= 0;
        try { ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | (SecurityProtocolType)12288; } // TLS 1.2 + 1.3
        catch { ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12; }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        var bg = Color.FromArgb(21, 23, 28); var fg = Color.FromArgb(230, 232, 238); var accent = Color.FromArgb(255, 138, 61);
        form = new Form {
            Text = "DeskMate Installer", ClientSize = new Size(380, 150), FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false, MinimizeBox = false, StartPosition = FormStartPosition.CenterScreen, BackColor = bg, ForeColor = fg,
            Font = new Font("Segoe UI", 9.5f),
        };
        try { form.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        form.Controls.Add(new Label { Text = "DeskMate", Font = new Font("Segoe UI", 15f, FontStyle.Bold), ForeColor = accent, AutoSize = true, Location = new Point(18, 14) });
        status = new Label { Text = "Finding the newest version...", AutoSize = false, Size = new Size(344, 34), Location = new Point(18, 48) };
        bar = new ProgressBar { Location = new Point(18, 84), Size = new Size(344, 14), Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 30 };
        button = new Button { Text = "Cancel", Location = new Point(282, 108), Size = new Size(80, 28), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(36, 40, 50), ForeColor = fg };
        button.FlatAppearance.BorderColor = Color.FromArgb(47, 52, 64);
        button.Click += (s, e) => form.Close();
        form.Controls.AddRange(new Control[] { status, bar, button });
        form.Shown += async (s, e) => await Run();
        Application.Run(form);
    }

    static async Task Run()
    {
        try
        {
            string json;
            using (var wc = new WebClient()) { wc.Headers["Cache-Control"] = "no-cache"; json = await wc.DownloadStringTaskAsync(UpdateUrl + "?t=" + DateTime.UtcNow.Ticks); }
            string version = Field(json, "version"), download = Field(json, "download"), sha = (Field(json, "sha256") ?? "").ToLowerInvariant();
            if (version == null || download == null || !Regex.IsMatch(sha, "^[0-9a-f]{64}$")) throw new Exception("The update information on the website looks wrong.");
            var uri = new Uri(download);
            if (uri.Scheme != "https" || Array.IndexOf(AllowedHosts, uri.Host.ToLowerInvariant()) < 0) throw new Exception("The download address isn't one DeskMate trusts.");

            status.Text = "Downloading DeskMate " + version + "...";
            bar.Style = ProgressBarStyle.Continuous;
            string file = Path.Combine(Path.GetTempPath(), "DeskMate-Setup-" + Regex.Replace(version, "[^0-9.]", "") + ".exe");
            using (var wc = new WebClient())
            {
                wc.DownloadProgressChanged += (s, e) => {
                    bar.Value = Math.Max(0, Math.Min(100, e.ProgressPercentage));
                    status.Text = string.Format("Downloading DeskMate {0}...  {1:0.0} / {2:0.0} MB", version, e.BytesReceived / 1048576.0, e.TotalBytesToReceive / 1048576.0);
                };
                form.FormClosing += (s, e) => wc.CancelAsync();
                await wc.DownloadFileTaskAsync(uri, file);
            }

            status.Text = "Checking the download...";
            string got;
            using (var f = File.OpenRead(file)) using (var h = SHA256.Create()) got = BitConverter.ToString(h.ComputeHash(f)).Replace("-", "").ToLowerInvariant();
            if (got != sha) { try { File.Delete(file); } catch { } throw new Exception("The download was changed or corrupted (checksum mismatch). Nothing was installed."); }

            if (dryRun) { File.WriteAllText(Path.Combine(Path.GetTempPath(), "dm-webinst.txt"), "OK " + version + " " + got + " " + new FileInfo(file).Length); File.Delete(file); form.Close(); return; }
            status.Text = "Installing DeskMate " + version + "...";
            Process.Start(new ProcessStartInfo(file) { UseShellExecute = true });
            await Task.Delay(800);
            form.Close();
        }
        catch (Exception ex)
        {
            if (form.IsDisposed) return;
            bar.Style = ProgressBarStyle.Continuous; bar.Value = 0;
            status.Text = (ex is WebException ? "Couldn't reach deskmate.lapistudios.com. Check your internet." : ex.Message);
            button.Text = "Close";
        }
    }

    // Tiny reader for the flat update.json ("key": "value"), so no JSON library is needed.
    static string Field(string json, string key)
    {
        var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        return m.Success ? Regex.Unescape(m.Groups[1].Value) : null;
    }
}
