param([int]$ExcludeProcessId)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class StudioWindowBounds {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 public class Item {public int x,y,width,height;public string title;}
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback c,IntPtr p);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr h,int index);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
 [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h,int a,out Rect r,int n);
 [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h,int a,out int r,int n);
 public static Item[] Read(int exclude) {
  var items=new List<Item>();
  EnumWindows(delegate(IntPtr h,IntPtr p) {
   uint owner;GetWindowThreadProcessId(h,out owner);
   if(owner==exclude||!IsWindowVisible(h)||IsIconic(h)||(GetWindowLong(h,-20)&0x20)!=0)return true;
   int cloaked;DwmGetWindowAttribute(h,14,out cloaked,4);if(cloaked!=0)return true;
   var title=new StringBuilder(512);GetWindowText(h,title,512);if(title.Length==0)return true;
   Rect r;if(DwmGetWindowAttribute(h,9,out r,16)!=0)return true;
   if(r.Right-r.Left<40||r.Bottom-r.Top<40)return true;
   items.Add(new Item{x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top,title=title.ToString()});return true;
  },IntPtr.Zero);return items.ToArray();
 }
}
'@
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
ConvertTo-Json -InputObject @([StudioWindowBounds]::Read($ExcludeProcessId)) -Compress
