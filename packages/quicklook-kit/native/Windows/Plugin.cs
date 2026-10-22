using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Web;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using QuickLook.Common.Helpers;
using QuickLook.Common.Plugin;

namespace QuickLookKit;

/// <summary>
/// Loads the bundled page from a fake HTTPS origin and hands it the previewed
/// file as <c>window.quicklook</c>, like native/Extension/PreviewViewController.swift.
/// Everything project-specific comes from quicklook.json, written by src/windows.ts.
/// </summary>
public class Plugin : IViewer
{
    private const string Origin = "https://quicklook.example/";

    private static readonly string Folder = Path.GetDirectoryName(typeof(Plugin).Assembly.Location);
    private static readonly string Web = Path.Combine(Folder, "web") + Path.DirectorySeparatorChar;
    private static readonly JavaScriptSerializer Json = new() { MaxJsonLength = int.MaxValue };

    private static readonly Dictionary<string, object> Manifest =
        Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(Folder, "quicklook.json")));

    private static readonly string Id = (string)Manifest["id"];
    private static readonly string Csp = (string)Manifest["csp"];
    private static readonly long MaxFileSize = Convert.ToInt64(Manifest["maxFileSize"]);
    private static readonly HashSet<string> Extensions =
        new(((IEnumerable<object>)Manifest["extensions"]).Cast<string>(), StringComparer.OrdinalIgnoreCase);

    private WebView2 _webView;

    // Above QL-Win's built-in viewers, which claim common extensions like .json too.
    public int Priority => 1;

    public void Init()
    {
    }

    // Larger files fall through to QL-Win's own viewers instead of stalling
    // while megabytes of base64 cross into the page.
    public bool CanHandle(string path) =>
        !Directory.Exists(path)
        && Extensions.Contains(Path.GetExtension(path).TrimStart('.'))
        && new FileInfo(path).Length <= MaxFileSize;

    public void Prepare(string path, ContextObject context)
    {
        context.PreferredSize = new Size(1000, 700);
    }

    public void View(string path, ContextObject context)
    {
        context.Title = Path.GetFileName(path);
        _ = ShowAsync(path, context);
    }

    private async Task ShowAsync(string path, ContextObject context)
    {
        try
        {
            try
            {
                CoreWebView2Environment.GetAvailableBrowserVersionString();
            }
            catch (WebView2RuntimeNotFoundException)
            {
                context.ViewerContent = Notice(
                    "This preview needs the Microsoft Edge WebView2 Runtime.\n\n" +
                    "Install it from https://developer.microsoft.com/microsoft-edge/webview2/ and preview the file again.");
                return;
            }

            _webView = new WebView2
            {
                CreationProperties = new CoreWebView2CreationProperties
                {
                    UserDataFolder = Path.Combine(Path.GetTempPath(), Id),
                },
            };
            context.ViewerContent = _webView;
            await _webView.EnsureCoreWebView2Async();
            var core = _webView.CoreWebView2;

            // Served by hand rather than mapped to the folder, so every response carries the CSP.
            core.AddWebResourceRequestedFilter(Origin + "*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, e) => e.Response = Serve(core.Environment, e.Request.Uri);
            core.NavigationStarting += (_, e) => e.Cancel = !e.Uri.StartsWith(Origin, StringComparison.Ordinal);
            core.NewWindowRequested += (_, e) => e.Handled = true;

            var file = new Dictionary<string, object>
            {
                ["name"] = Path.GetFileName(path),
                ["extension"] = Path.GetExtension(path).TrimStart('.').ToLowerInvariant(),
                ["base64"] = Convert.ToBase64String(File.ReadAllBytes(path)),
            };
            var settings = (IEnumerable<object>)Manifest["settings"];
            if (settings.Any())
            {
                file["settings"] = ResolveSettings(settings.Cast<Dictionary<string, object>>());
            }
            // JSON is a valid JavaScript expression, so this needs no escaping of its own.
            await core.AddScriptToExecuteOnDocumentCreatedAsync($"window.quicklook = {Json.Serialize(file)};");

            core.Navigate(Origin);
        }
        catch (Exception e)
        {
            context.ViewerContent = Notice(e.ToString());
        }
        finally
        {
            context.IsBusy = false;
        }
    }

    private static CoreWebView2WebResourceResponse Serve(CoreWebView2Environment environment, string uri)
    {
        var path = Uri.UnescapeDataString(new Uri(uri).AbsolutePath).TrimStart('/');
        if (path.Length == 0 || path.EndsWith("/"))
        {
            path += "index.html";
        }
        var file = Path.GetFullPath(Path.Combine(Web, path));
        // `..%2f` arrives decoded as a real `..`; never serve anything outside web\.
        var found = file.StartsWith(Web, StringComparison.OrdinalIgnoreCase) && File.Exists(file);
        var headers =
            $"Content-Type: {(found ? MimeMapping.GetMimeMapping(file) : "text/plain")}\r\n" +
            $"Content-Security-Policy: {Csp}";
        return environment.CreateWebResourceResponse(
            found ? new MemoryStream(File.ReadAllBytes(file)) : null,
            found ? 200 : 404,
            found ? "OK" : "Not Found",
            headers);
    }

    /// <summary>
    /// Defaults overridden by valid values from QL-Win's settings file for this
    /// plugin, <c>%APPDATA%\pooi.moe\QuickLook\&lt;id&gt;.config</c>, as nested objects.
    /// </summary>
    private static Dictionary<string, object> ResolveSettings(IEnumerable<Dictionary<string, object>> specs)
    {
        var values = new Dictionary<string, object>();
        foreach (var spec in specs)
        {
            var key = (string)spec["key"];
            var type = (string)spec["type"];
            var fallback = Parse(Convert.ToString(spec["default"], CultureInfo.InvariantCulture), type);
            var stored = SettingHelper.Get<string>(key, null, Id);
            var value = stored == null ? null : Parse(stored.Trim(), type);
            if (value == null || !IsValid(value, type, spec))
            {
                value = fallback;
            }

            var parts = key.Split('.');
            var parent = values;
            foreach (var part in parts.Take(parts.Length - 1))
            {
                if (!parent.TryGetValue(part, out var child))
                {
                    parent[part] = child = new Dictionary<string, object>();
                }
                parent = (Dictionary<string, object>)child;
            }
            parent[parts.Last()] = value;
        }
        return values;
    }

    /// <summary>The setting's value as bool, string, long or double, or null if it isn't one.</summary>
    private static object Parse(string text, string type) => type switch
    {
        "boolean" => bool.TryParse(text, out var b) ? b : null,
        "string" => text,
        "integer" => long.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var l) ? l : null,
        "number" => double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : null,
        _ => null,
    };

    private static bool IsValid(object value, string type, Dictionary<string, object> spec)
    {
        if (spec.TryGetValue("enum", out var options)
            && !((IEnumerable<object>)options).Any(o =>
                Equals(Parse(Convert.ToString(o, CultureInfo.InvariantCulture), type), value)))
        {
            return false;
        }
        if (value is long or double)
        {
            var number = Convert.ToDouble(value);
            if (spec.TryGetValue("minimum", out var min) && number < Convert.ToDouble(min)) return false;
            if (spec.TryGetValue("maximum", out var max) && number > Convert.ToDouble(max)) return false;
        }
        return true;
    }

    private static TextBox Notice(string text) =>
        new() { Text = text, IsReadOnly = true, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(16) };

    public void Cleanup()
    {
        _webView?.Dispose();
        _webView = null;
    }
}
