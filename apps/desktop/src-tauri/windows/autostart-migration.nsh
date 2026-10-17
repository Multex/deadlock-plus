!ifndef DP_AUTOSTART_MIGRATION_NSH
!define DP_AUTOSTART_MIGRATION_NSH

!include LogicLib.nsh

!define /ifndef DP_AUTOSTART_VALUE "DeadlockPlus"
!define /ifndef DP_AUTOSTART_TASK "DeadlockPlus"
!define /ifndef DP_AUTOSTART_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define /ifndef DP_AUTOSTART_APPROVED_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"

; PowerShell snippets for `_DP_TASK_OWNER_SID`. Each leaves the task XML in $t. The script text is fixed: the XML
; is only ever data inside PowerShell, never spliced into a command line.
!define _DP_PS_TASK_XML "$$t=(& (Join-Path ([Environment]::SystemDirectory) 'schtasks.exe') /query /tn '${DP_AUTOSTART_TASK}' /xml) -join [char]10; if ($$LASTEXITCODE -ne 0) { exit 2 };"
; The app registers the principal as DOMAIN\name, but Task Scheduler exports it as a SID.
!define _DP_PS_SID_FROM_XML "$$p=@(([xml]$$t).Task.Principals.Principal)[0].UserId; if ($$p -match '^S-1-') { $$s=[Security.Principal.SecurityIdentifier]$$p } else { $$s=([Security.Principal.NTAccount]$$p).Translate([Security.Principal.SecurityIdentifier]) }; [Console]::Out.Write($$s.Value)"

; Clears $1 unless it is "S-1-" followed only by digits and dashes, so it cannot name another key in a registry path.
; Clobbers $2-$4.
!macro _DP_KEEP_IF_SID
  StrCpy $2 $1 4
  StrLen $3 $1
  ${If} $2 S!= "S-1-"
  ${OrIf} $3 > 184
    StrCpy $1 ""
  ${Else}
    StrCpy $4 4
    ${Do}
      StrCpy $2 $1 1 $4
      ${IfThen} $2 == "" ${|} ${ExitDo} ${|}
      ; IntOp reads any non-digit as 0.
      IntOp $3 $2 + 0
      ${If} $3 = 0
      ${AndIf} $2 != "0"
      ${AndIf} $2 != "-"
        StrCpy $1 ""
        ${ExitDo}
      ${EndIf}
      IntOp $4 $4 + 1
    ${Loop}
    ${IfThen} $4 = 4 ${|} StrCpy $1 "" ${|}
  ${EndIf}
!macroend

; Runs SOURCE (a snippet that sets $t to task XML) and leaves the principal's SID in $1, or "" when it cannot be
; resolved. Clobbers $0, $2-$4.
!macro _DP_TASK_OWNER_SID SOURCE
  nsExec::ExecToStack /TIMEOUT=30000 `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "$$ErrorActionPreference='Stop'; try { ${SOURCE} ${_DP_PS_SID_FROM_XML} } catch { exit 3 }"`
  Pop $0
  Pop $1
  ${If} $0 != 0
    StrCpy $1 ""
  ${EndIf}
  !insertmacro _DP_KEEP_IF_SID
!macroend

; Writes the Run value into the hive of SID $1, only if that hive is loaded. Clobbers $2.
!macro _DP_WRITE_RUN_FOR_SID EXE
  ${If} $1 != ""
    ClearErrors
    EnumRegKey $2 HKU "$1" 0
    ${IfNot} ${Errors}
      WriteRegStr HKU "$1\${DP_AUTOSTART_RUN_KEY}" "${DP_AUTOSTART_VALUE}" '"${EXE}" --autostart'
    ${EndIf}
  ${EndIf}
!macroend

; Moves autostart from the elevated logon task to the task owner's HKCU Run value. A non-elevated exe cannot delete
; that task, so the elevated installer must. The installer may run under another account (over-the-shoulder UAC),
; so the value goes into HKU\<owner SID>, never the installer's own HKCU. When the owner is signed out their hive is
; not loaded and autostart ends up off. No-op when the task does not exist.
!macro DP_MIGRATE_AUTOSTART_TASK_TO_RUN EXE
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4

  nsExec::ExecToStack `"$SYSDIR\schtasks.exe" /query /tn "${DP_AUTOSTART_TASK}"`
  Pop $0
  Pop $1
  ${If} $0 == 0
    !insertmacro _DP_TASK_OWNER_SID "${_DP_PS_TASK_XML}"
    nsExec::ExecToStack `"$SYSDIR\schtasks.exe" /delete /tn "${DP_AUTOSTART_TASK}" /f`
    Pop $0
    Pop $2
    ; A task that is still there would launch the app a second time at logon.
    ${If} $0 == 0
      !insertmacro _DP_WRITE_RUN_FOR_SID "${EXE}"
    ${EndIf}
  ${EndIf}

  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

; Removes the uninstalling account's Run value and its Task Manager enabled/disabled state. Missing values are fine.
!macro DP_REMOVE_AUTOSTART_RUN
  DeleteRegValue HKCU "${DP_AUTOSTART_RUN_KEY}" "${DP_AUTOSTART_VALUE}"
  DeleteRegValue HKCU "${DP_AUTOSTART_APPROVED_KEY}" "${DP_AUTOSTART_VALUE}"
!macroend

!endif
