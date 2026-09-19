' Sevencars: arranca el vigilante de fotos en WSL (escondido) al iniciar sesion.
' Copiar este archivo a la carpeta de inicio de Windows:
'   C:\Users\Usuario\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
Set sh = CreateObject("WScript.Shell")
sh.Run "wsl.exe -d Ubuntu -u seb -- /home/seb/crmnuevo/automatizaciones/sevencars-fichas/vigilar.sh", 0, False
