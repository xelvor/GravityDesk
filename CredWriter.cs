using System;
using System.Runtime.InteropServices;

public class CredWriter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint flags;
        public uint type;
        public IntPtr targetName;
        public IntPtr comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME lastWritten;
        public uint credentialBlobSize;
        public IntPtr credentialBlob;
        public uint persist;
        public uint attributeCount;
        public IntPtr attributes;
        public IntPtr targetAlias;
        public IntPtr userName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite([In] ref CREDENTIAL userCredential, [In] uint flags);

    public static void Main(string[] args) {
        if (args.Length < 3) {
            Console.WriteLine("Usage: CredWriter.exe <target> <user> <payload>");
            return;
        }

        string target = args[0];
        string user = args[1];
        string payload = args[2];
        byte[] blob = System.Text.Encoding.UTF8.GetBytes(payload);

        CREDENTIAL cred = new CREDENTIAL();
        cred.type = 1; // CRED_TYPE_GENERIC
        cred.targetName = Marshal.StringToHGlobalUni(target);
        cred.userName = Marshal.StringToHGlobalUni(user);
        cred.credentialBlobSize = (uint)blob.Length;
        cred.credentialBlob = Marshal.AllocHGlobal(blob.Length);
        Marshal.Copy(blob, 0, cred.credentialBlob, blob.Length);
        cred.persist = 2; // CRED_PERSIST_LOCAL_MACHINE

        if (CredWrite(ref cred, 0)) {
            Console.WriteLine("SUCCESS");
        } else {
            Console.WriteLine("ERROR: " + Marshal.GetLastWin32Error());
        }

        Marshal.FreeHGlobal(cred.targetName);
        Marshal.FreeHGlobal(cred.userName);
        Marshal.FreeHGlobal(cred.credentialBlob);
    }
}
