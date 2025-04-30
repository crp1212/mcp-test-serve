import fs from 'fs'
import path from 'path'

/**
 * 从数据中提取翻译
 * @param {object} data - 包含翻译数据的数据对象
 * @param {string} prefix - 前缀
 * @returns {object} - 包含翻译的对象
 */
interface FileDataAnalysis {
  [prop: string]: string | FileDataAnalysis
}
function extractTranslations(data: FileDataAnalysis, prefix = '') {
  const translations = {} as Record<string, string>;
  for (const key in data) {
    if (typeof data[key] === 'string') {
      translations[data[key]] = prefix ? `${prefix}.${key}` : key;
    } else if (typeof data[key] === 'object' && data[key] !== null) {
      const nestedPrefix = prefix ? `${prefix}.${key}` : key;
      Object.assign(translations, extractTranslations(data[key], nestedPrefix));
    }
  }

  return translations;
}

/**
 * 获取语言文件路径
 * @param {string} dir - 目录
 * @returns {array} - 包含文件路径的数组
 */
function getLangFilePaths(dir: string) {
  const absoluteDir = path.resolve(dir);
  const files = fs.readdirSync(dir);
  const filePaths = files.map((file: string) => path.join(absoluteDir, file));
  return filePaths;
}

/**
 * 获取文件数据
 * @param {string} str - 文件路径
 * @returns {object} - 包含翻译的对象
 */
function getFileData (str: string) {
  const fileStr = fs.readFileSync(str).toString()
  const obj = new Function('return ' + fileStr.replace('export default ', ''))()
  return extractTranslations(obj, getFileNameFromPath(str).replace('.ts', ''))
}


/**
 * 从路径中获取文件名
 * @param {string} filePath - 文件路径
 * @returns {string} - 文件名
 */
function getFileNameFromPath(filePath:string) {
  const parts = filePath.split(path.sep);
  return parts.pop() || ''
}

/**
 * 获取文本的英文键
 * @param {string} str - 目录
 * @returns {object} - 包含翻译的对象
 */
export function getTextEnKey (dirName: string) {
  if (!dirName) { return {} }
  return getLangFilePaths(dirName).map((str:string) => getFileData(str)).reduce((result, obj) => {
    return {
      ...result,
      ...obj
    }
  }, {})
}

export function searchCnKey (dirName: string, cnKeys:string[]) {
  const currentKey = getTextEnKey(dirName)
  const info: {
    availableKeyInfo: Record<string, string>
    noExistKeys: string[]
  } = {
    availableKeyInfo: {},
    noExistKeys: []
  };
  [...new Set(cnKeys)].forEach(key =>{ // 去重后使用
    if (currentKey[key]) {
      info.availableKeyInfo[key] = currentKey[key]
    } else {
      info.noExistKeys.push(key)
    }
  })
  return info
}
