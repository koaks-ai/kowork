import { contextBridge } from 'electron'
import { koWorkApi } from './api'

contextBridge.exposeInMainWorld('kowork', koWorkApi)
