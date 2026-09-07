# Create/overwrite a Windows shortcut with target, icon, and AUMID written
# in ONE atomic IPersistFile save.
#
# Do NOT use WScript.Shell + set_aumid.ps1 as two separate passes — that flow
# can leave the .lnk with an empty target (291-byte shell), which breaks
# desktop/Start Menu launch and makes taskbar pinning produce dead entries
# ("Can't open this item").
#
# Also note: pinning a RUNNING window pins by AUMID, which only resolves if a
# Start Menu shortcut carrying the same AUMID exists (this registers the app
# in shell:AppsFolder). So always install the Start Menu shortcut first:
#   .\make_shortcut.ps1 -LnkPath "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\30-30.lnk"
param(
  [Parameter(Mandatory)] [string]$LnkPath,
  [string]$Target = "E:\[04] Claude Code\06 30 30 Helper\App\30-30.exe",
  [string]$WorkDir = "E:\[04] Claude Code\06 30 30 Helper\App",
  [string]$Icon = "E:\[04] Claude Code\06 30 30 Helper\build\icon-win.ico",
  [string]$AppId = "com.yuchen.helper3030"
)

$src = @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

namespace Helper3030SL {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  public class CShellLink {}

  [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszFile, int cch, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszName, int cch);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszDir, int cch);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszArgs, int cch);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out ushort pwHotkey);
    void SetHotkey(ushort wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszIconPath, int cch, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PROPERTYKEY { public Guid fmtid; public uint pid; }

  [StructLayout(LayoutKind.Sequential)]
  public struct PROPVARIANT { public ushort vt; public ushort r1; public ushort r2; public ushort r3; public IntPtr ptr; public IntPtr pad; }

  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    uint GetCount();
    PROPERTYKEY GetAt(uint i);
    void GetValue(ref PROPERTYKEY k, out PROPVARIANT v);
    void SetValue(ref PROPERTYKEY k, ref PROPVARIANT v);
    void Commit();
  }

  public static class Maker {
    public static void Make(string lnkPath, string target, string workDir, string icon, string appId) {
      var link = (IShellLinkW)new CShellLink();
      link.SetPath(target);
      link.SetWorkingDirectory(workDir);
      link.SetIconLocation(icon, 0);
      var store = (IPropertyStore)link;
      var key = new PROPERTYKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
      var pv = new PROPVARIANT { vt = 31, ptr = Marshal.StringToCoTaskMemUni(appId) };
      store.SetValue(ref key, ref pv);
      store.Commit();
      Marshal.FreeCoTaskMem(pv.ptr);
      ((IPersistFile)link).Save(lnkPath, true);
    }
  }
}
"@

if (-not ("Helper3030SL.Maker" -as [type])) {
  Add-Type -TypeDefinition $src -Language CSharp
}

[Helper3030SL.Maker]::Make($LnkPath, $Target, $WorkDir, $Icon, $AppId)

# read back to verify the target survived the save
$ws = New-Object -ComObject WScript.Shell
$check = $ws.CreateShortcut($LnkPath)
if (-not $check.TargetPath) { throw "shortcut saved but target is EMPTY: $LnkPath" }
Write-Output "created $LnkPath -> $($check.TargetPath) (AUMID $AppId)"
