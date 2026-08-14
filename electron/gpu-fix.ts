import { app } from 'electron'

// Must run before any BrowserWindow is created (Windows GPU hangs).
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('in-process-gpu')
