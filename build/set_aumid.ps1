param(
  [string]$LnkPath,
  [string]$AppId = "com.yuchen.helper3030"
)

$src = @"
using System;
using System.Runtime.InteropServices;

namespace Helper3030 {
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct PROPERTYKEY {
        public Guid fmtid;
        public uint pid;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROPVARIANT {
        public ushort vt;
        public ushort wReserved1;
        public ushort wReserved2;
        public ushort wReserved3;
        public IntPtr ptr;
        public IntPtr pad;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore {
        uint GetCount();
        PROPERTYKEY GetAt(uint iProp);
        void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        void SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
        void Commit();
    }

    public static class Lnk {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        public static extern void SHGetPropertyStoreFromParsingName(
            string path, IntPtr zero, int flags, ref Guid riid, out IPropertyStore store);

        public static void SetAppId(string lnkPath, string appId) {
            Guid storeId = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
            IPropertyStore store;
            // GPS_READWRITE = 2
            SHGetPropertyStoreFromParsingName(lnkPath, IntPtr.Zero, 2, ref storeId, out store);

            PROPERTYKEY key = new PROPERTYKEY {
                fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),
                pid = 5
            };

            PROPVARIANT pv = new PROPVARIANT {
                vt = 31, // VT_LPWSTR
                ptr = Marshal.StringToCoTaskMemUni(appId)
            };

            try {
                store.SetValue(ref key, ref pv);
                store.Commit();
            } finally {
                if (pv.ptr != IntPtr.Zero) Marshal.FreeCoTaskMem(pv.ptr);
                Marshal.ReleaseComObject(store);
            }
        }
    }
}
"@

if (-not ("Helper3030.Lnk" -as [type])) {
  Add-Type -TypeDefinition $src -Language CSharp
}

[Helper3030.Lnk]::SetAppId($LnkPath, $AppId)
Write-Output "set AUMID '$AppId' on $LnkPath"
