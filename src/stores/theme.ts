import { ref, onMounted } from 'vue'
import { defineStore } from 'pinia'
import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs'
import { join, appDataDir } from '@tauri-apps/api/path'

export const useThemeStore = defineStore('theme', () => {
  const current = ref('dark')
  const fontSize = ref(14)  // 新增：字体大小
  const CONFIG_FILE = 'config.json'

  // 获取配置文件路径
  const getConfigPath = async () => {
    const appData = await appDataDir()
    const configDir = await join(appData, 'my-theme-editor')
    
    try {
      if (!await exists(configDir)) {
        await mkdir(configDir, { recursive: true })
      }
    } catch (e) {
      console.log('目录已存在或创建失败:', e)
    }
    
    return await join(configDir, CONFIG_FILE)
  }

  // 加载配置
  const load = async () => {
    try {
      const configPath = await getConfigPath()
      
      if (await exists(configPath)) {
        const content = await readTextFile(configPath)
        const config = JSON.parse(content)
        
        if (config.theme && isValidTheme(config.theme)) {
          current.value = config.theme
        }
        // 加载字体大小
        if (config.fontSize && config.fontSize >= 10 && config.fontSize <= 24) {
          fontSize.value = config.fontSize
        }
        
        console.log('✅ 加载配置:', { theme: current.value, fontSize: fontSize.value })
      }
    } catch (err) {
      console.error('❌ 加载配置失败:', err)
    }
  }

  // 保存配置
  const save = async () => {
    try {
      const configPath = await getConfigPath()
      const config = { 
        theme: current.value,
        fontSize: fontSize.value,  // 保存字体大小
        updatedAt: new Date().toISOString()
      }
      
      await writeTextFile(configPath, JSON.stringify(config, null, 2))
      console.log('💾 保存配置:', config)
    } catch (err) {
      console.error('❌ 保存配置失败:', err)
    }
  }

  // 验证主题
  const isValidTheme = (theme: string) => {
    const validThemes = [
      'dark', 'light', 'purple', 'light-red', 'dark-red',
      'light-purple', 'dark-purple', 'high-contrast', 'win7',
      'newyear', 'mint', 'ocean', 'sunset', 'sakura',
      'cyberpunk', 'coffee', 'aurora', 'forest'
    ]
    return validThemes.includes(theme)
  }

  // 应用配置（切换时调用）
  const apply = async () => {
    await save()
  }

  // 启动时加载
  onMounted(() => {
    load()
  })

  return { current, fontSize, apply, load, save }
})