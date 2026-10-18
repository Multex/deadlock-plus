!include "${__FILEDIR__}\autostart-migration.nsh"

!ifndef DEADLOCK_PLUS_SERVICE
  !define DEADLOCK_PLUS_SERVICE "DeadlockPlusHelper"
!endif
; The privileged server logs to %ProgramData%\Deadlock+ and refuses a folder that SYSTEM or Administrators do not
; own: any user may create folders in ProgramData and plant links there. Same DACL as the server's own folder.
!ifndef DEADLOCK_PLUS_DIR_SDDL
  !define DEADLOCK_PLUS_DIR_SDDL "O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FRFX;;;BU)"
!endif
!define DP_ATTR_DIRECTORY 16
!define DP_ATTR_REPARSE_POINT 1024
!define DP_ATTR_DIR_OR_REPARSE 1040
!define DP_CSIDL_COMMON_APPDATA 0x23
; READ_CONTROL | WRITE_DAC | WRITE_OWNER
!define DP_SECURITY_ACCESS 0xE0000
; FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT: open a link itself, never its target.
!define DP_OPEN_NO_FOLLOW 0x02200000

!macro DeadlockPlusDataDirPath out
  Push $R8
  Push $R9
  System::Call 'shell32::SHGetFolderPathW(p 0, i ${DP_CSIDL_COMMON_APPDATA}, p 0, i 0, w .R9) i .R8'
  ${If} $R8 = 0
  ${AndIf} $R9 != ""
    StrCpy $R9 "$R9\Deadlock+"
  ${Else}
    StrCpy $R9 ""
  ${EndIf}
  Pop $R8
  Exch $R9
  Pop ${out}
!macroend

; The installed exe is about to be replaced or removed, and a running service would also hold it. The app restarts
; the on-demand service on its next privileged call, so this runs right before the template closes the app.
!macro DeadlockPlusStopService
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  nsExec::ExecToStack '"$SYSDIR\sc.exe" query ${DEADLOCK_PLUS_SERVICE}'
  Pop $R0
  Pop $R1
  ${If} $R0 = 0
    nsExec::Exec '"$SYSDIR\sc.exe" stop ${DEADLOCK_PLUS_SERVICE}'
    Pop $R0
    ${For} $R0 1 60
      nsExec::ExecToStack '"$SYSDIR\sc.exe" query ${DEADLOCK_PLUS_SERVICE}'
      Pop $R1
      Pop $R2
      ${IfThen} $R1 <> 0 ${|} ${ExitFor} ${|}
      StrCpy $R3 0
      ${Do}
        StrCpy $R4 $R2 7 $R3
        ${If} $R4 == ""
        ${OrIf} $R4 == "STOPPED"
          ${ExitDo}
        ${EndIf}
        IntOp $R3 $R3 + 1
      ${Loop}
      ${IfThen} $R4 == "STOPPED" ${|} ${ExitFor} ${|}
      Sleep 500
    ${Next}
  ${EndIf}
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

; $R0 = path, ${attrs} = its attributes. RemoveDirectoryW and DeleteFileW act on a link itself, not its target.
!macro _DeadlockPlusRemoveName attrs
  IntOp $R9 ${attrs} & ${DP_ATTR_DIRECTORY}
  ${If} $R9 <> 0
    System::Call 'kernel32::RemoveDirectoryW(w R0) i'
  ${Else}
    System::Call 'kernel32::DeleteFileW(w R0) i'
  ${EndIf}
!macroend

; $R0 = path of an existing entry, $R1 = the wanted descriptor. Sets $R3 to nonzero once the entry is a real
; directory that now carries that descriptor. Everything goes through one handle, so a link swapped in after the
; attribute check is seen as a link. The descriptor is written to this object only (no inheritance walk), and only
; when the owner already is the wanted one or SYSTEM: a user's folder may still be open in that user's hands.
!macro _DeadlockPlusSecureExisting
  StrCpy $R3 0
  System::Call 'kernel32::CreateFileW(w R0, i ${DP_SECURITY_ACCESS}, i 7, p 0, i 3, i ${DP_OPEN_NO_FOLLOW}, p 0) p .R5'
  ${If} $R5 P<> -1
    System::Alloc 52
    Pop $R6
    System::Call 'kernel32::GetFileInformationByHandle(p R5, p R6) i .R4'
    ${If} $R4 <> 0
      System::Call '*$R6(i .R4)'
      IntOp $R4 $R4 & ${DP_ATTR_DIR_OR_REPARSE}
      ${If} $R4 = ${DP_ATTR_DIRECTORY}
        System::Call 'advapi32::GetSecurityInfo(p R5, i 1, i 1, *p .R7, p 0, p 0, p 0, *p .R8) i .R4'
        ${If} $R4 = 0
          System::Call 'advapi32::GetSecurityDescriptorOwner(p R1, *p .R9, *i .R4) i'
          System::Call 'advapi32::EqualSid(p R7, p R9) i .R4'
          ${If} $R4 = 0
            System::Call 'advapi32::IsWellKnownSid(p R7, i 22) i .R4'
          ${EndIf}
          System::Call 'kernel32::LocalFree(p R8) p'
          ${If} $R4 <> 0
            System::Call 'advapi32::SetKernelObjectSecurity(p R5, i 5, p R1) i .R3'
          ${EndIf}
        ${EndIf}
      ${EndIf}
    ${EndIf}
    System::Free $R6
    System::Call 'kernel32::CloseHandle(p R5) i'
  ${EndIf}
!macroend

!macro DeadlockPlusPrepareDataDir path
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9
  StrCpy $R0 "${path}"
  System::Call 'kernel32::GetFileAttributesW(w R0) i .R1'
  ${If} $R1 <> -1
    IntOp $R2 $R1 & ${DP_ATTR_REPARSE_POINT}
    IntOp $R3 $R1 & ${DP_ATTR_DIRECTORY}
    ${If} $R2 <> 0
    ${OrIf} $R3 = 0
      !insertmacro _DeadlockPlusRemoveName $R1
    ${EndIf}
  ${EndIf}
  System::Call 'advapi32::ConvertStringSecurityDescriptorToSecurityDescriptorW(w "${DEADLOCK_PLUS_DIR_SDDL}", i 1, *p .R1, p 0) i .R2'
  ${If} $R2 <> 0
    !if ${NSIS_PTR_SIZE} > 4
      System::Call '*(i 24, i 0, p R1, i 0, i 0) p .R2'
    !else
      System::Call '*(i 12, p R1, i 0) p .R2'
    !endif
    System::Call 'kernel32::CreateDirectoryW(w R0, p R2) i .R3 ?e'
    Pop $R4
    ${If} $R3 = 0
    ${AndIf} $R4 = 183
      !insertmacro _DeadlockPlusSecureExisting
      ${If} $R3 = 0
        ; MoveFileW renames the entry itself, whatever it is, so nothing of it is followed or kept.
        System::Call 'kernel32::GetTickCount() i .R4'
        System::Call 'kernel32::MoveFileW(w R0, w "$R0.old-$R4") i'
        System::Call 'kernel32::CreateDirectoryW(w R0, p R2) i'
      ${EndIf}
    ${EndIf}
    System::Free $R2
    System::Call 'kernel32::LocalFree(p R1) p'
  ${EndIf}
  ClearErrors
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

; Deletes only the server's own files and never recurses, so nothing here can walk into a link.
!macro DeadlockPlusRemoveDataDir path
  Push $R0
  Push $R1
  Push $R9
  StrCpy $R0 "${path}"
  System::Call 'kernel32::GetFileAttributesW(w R0) i .R1'
  ${If} $R1 <> -1
    IntOp $R9 $R1 & ${DP_ATTR_REPARSE_POINT}
    ${If} $R9 <> 0
      !insertmacro _DeadlockPlusRemoveName $R1
    ${Else}
      IntOp $R9 $R1 & ${DP_ATTR_DIRECTORY}
      ${If} $R9 <> 0
        Delete "$R0\helper.log"
        Delete "$R0\helper.log.1"
        RMDir "$R0"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ClearErrors
  Pop $R9
  Pop $R1
  Pop $R0
!macroend

; The old app can restart the on-demand service before the template closes it. Disabled for the duration of the
; install, then set back to on-demand by the post-install hook. Does nothing when the service is not installed.
!macro DeadlockPlusSetServiceStart mode
  Push $R0
  Push $R1
  nsExec::ExecToStack '"$SYSDIR\sc.exe" query ${DEADLOCK_PLUS_SERVICE}'
  Pop $R0
  Pop $R1
  ${If} $R0 = 0
    nsExec::Exec '"$SYSDIR\sc.exe" config ${DEADLOCK_PLUS_SERVICE} start= ${mode}'
    Pop $R0
  ${EndIf}
  Pop $R1
  Pop $R0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro DeadlockPlusSetServiceStart disabled
  !insertmacro DeadlockPlusStopService
  Push $0
  !insertmacro DeadlockPlusDataDirPath $0
  ${If} $0 != ""
    !insertmacro DeadlockPlusPrepareDataDir $0
  ${EndIf}
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro DeadlockPlusSetServiceStart demand
  !insertmacro DP_MIGRATE_AUTOSTART_TASK_TO_RUN "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend

; A real uninstall removes everything the install put outside the install dir: autostart (Run value and any task
; from an older install), the helper service, the firewall rules and the helper's data folder. An update skips
; that, because the new version reuses all of it.
!macro NSIS_HOOK_PREUNINSTALL
  ; Stopped even during updates: the template's running-app check comes next and would meet the service's
  ; SYSTEM process. Stopping keeps the approval.
  !insertmacro DeadlockPlusStopService
  ${If} $UpdateMode <> 1
    !insertmacro DP_REMOVE_AUTOSTART_RUN
    nsExec::Exec '"$SYSDIR\schtasks.exe" /end /tn "DeadlockPlus"'
    Pop $0
    nsExec::Exec '"$SYSDIR\schtasks.exe" /delete /tn "DeadlockPlus" /f'
    Pop $0
    nsExec::Exec '"$SYSDIR\sc.exe" delete ${DEADLOCK_PLUS_SERVICE}'
    Pop $0
    ; dp-firewall sets the COM rule Name, which the NetSecurity cmdlets expose as DisplayName.
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Remove-NetFirewallRule -DisplayName 'deadlock_plus_*' -ErrorAction SilentlyContinue"`
    Pop $0
    Push $0
    !insertmacro DeadlockPlusDataDirPath $0
    ${If} $0 != ""
      !insertmacro DeadlockPlusRemoveDataDir $0
    ${EndIf}
    Pop $0
  ${EndIf}
!macroend
