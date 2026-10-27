!macro customInstall
  ; Open firewall for Frontend (Port 3000)
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="RFS Frontend" dir=in action=allow protocol=TCP localport=3000'
  ; Open firewall for Backend (Port 4000)
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="RFS Backend" dir=in action=allow protocol=TCP localport=4000'
!macroend