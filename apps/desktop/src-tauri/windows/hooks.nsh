; NSIS installer hooks (tauri.conf.json > bundle.windows.nsis.installerHooks).
; Adds "Open with MarkType" to the Explorer context menu of folders, folder backgrounds and Markdown
; files (docs/SPEC.md section 14). The installer is per user, so everything goes under HKCU.

!macro MT_MENU_LABEL
  ; Italian (1040) Windows gets an Italian label, everything else English.
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
  StrCpy $1 "Open with MarkType"
  IntCmp $0 1040 0 +2 +2
  StrCpy $1 "Apri con MarkType"
!macroend

!macro MT_ADD_MENU KEY ARG
  WriteRegStr HKCU "Software\Classes\${KEY}\shell\MarkType" "" "$1"
  WriteRegStr HKCU "Software\Classes\${KEY}\shell\MarkType" "Icon" "$INSTDIR\marktype.exe,0"
  WriteRegStr HKCU "Software\Classes\${KEY}\shell\MarkType\command" "" '"$INSTDIR\marktype.exe" "${ARG}"'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro MT_MENU_LABEL
  !insertmacro MT_ADD_MENU "Directory" "%1"
  !insertmacro MT_ADD_MENU "Directory\Background" "%V"
  !insertmacro MT_ADD_MENU "SystemFileAssociations\.md" "%1"
  !insertmacro MT_ADD_MENU "SystemFileAssociations\.markdown" "%1"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\MarkType"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\MarkType"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.md\shell\MarkType"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\MarkType"
!macroend
