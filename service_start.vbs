' Daigua Drawing Site - silent keeper service starter (no window)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "D:\huahua"
shell.Run "cmd /c service.bat", 0, False
