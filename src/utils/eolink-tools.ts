import axios from "axios"; // 导入 axios 用于 HTTP 请求
import FormData from 'form-data';
/**
 * 主要实现的功能
 * 1. 传入eolink接口地址
 * 2. 解析url地址获取相关信息
 * 3. 通过axios请求接口信息详情
 * 4. 格式化为可用的结构
 */
export interface EolinkApiDetailParams {
  projectHashKey: string
  apiID: string
  spaceKey: string
}
export interface EolinkApiInfoItem {
  field: string
  valueType: string
  description: string
  children: EolinkApiInfoItem[]
}
export interface EolinkGetApiDetailResult {
  apiUrl: string
  apiName: string
  apiRequestType: string
  result: EolinkApiInfoItem[]
  requestBody: EolinkApiInfoItem[],
  requestQuery: EolinkApiInfoItem[],
  resultInfoInterface: string
  urlParamInterface: string
  bodyParamsInterface: string
}
const detailAPiUrl = 'https://eolink.xa.com/index.php/apiManagementPro/Api/getApi'
// 获取url参数
export const getQueryStringArgs = (url: string): Record<string, string> => {
  const arr = url.split('?')
  const qs = arr.length === 2 ? arr[1] : ''
  const args: Record<string, string> = {}
  const items = qs.length ? qs.split('&') : []
  for (let i = 0; i < items.length; i++) {
    const item = items[i].split('=')
    const name = decodeURIComponent(item[0])
    const value = decodeURIComponent(item[1])
    if (name.length) {
      args[name] = value
    }
  }
  return args
}
function parseTestUrl(url: string) {
  const regex = /inside\/(.*?)\/api\/\d+\/detail\/(.*?)\?spaceKey=(.*)/;
  const match = url.match(regex);

  if (match) {
    return {
      projectHashKey: match[1],
      apiID: match[2],
      spaceKey: match[3],
    };
  } else {
    return null;
  }
}

async function getApiDetail(url: string) {
  const params = parseTestUrl(url);
  try {
    const formData = new FormData();
    for (const key in params) {
      formData.append(key, params[key as keyof EolinkApiDetailParams]);
    }

    const data = await axios.post(detailAPiUrl, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJjbGllbnQiOjAsImV4cCI6MTc0MzY1ODQ4NDY5NCwidXNlcklkIjoiNiJ9.As7NVG_euOd-jrAfpI1F9H8LIHfoqtXunZO7mk-YiQ4'
      },
    });
    if (data.data.statusCode === '200001') {
      // 未登录
      return Promise.reject(new Error('未登录'))
    } else {
      return data.data?.apiInfo
    }
  } catch (error) {
    console.error(error);
    return Promise.reject(error)
  }
}

async function eolinkLoginHandle () {
  
}
const paramTypeMap: Record<string, string> = {
  '14': 'number',
  '0': 'string',
  '13': 'object',
  '12': 'array'
}
function getPrefixValue (prefix: number) {
  return '  '.repeat(prefix)
} 
// function getPreix
let dataStructureMap: Record<string, any> = {}
function formatInfoToInterface (obj: any, prefix = 1) {
  function getChildContent (obj: any, prefix: number) {
    let list = obj.childList || []
    if (list.length && list[0].structureID) {
      // console.log('dataStructureMap',list[0].structureID, Object.keys(dataStructureMap), dataStructureMap[list[0].structureID])
      list = dataStructureMap[list[0].structureID]
      
    }
    return '\n' +  (list || []).map((item: string) => formatInfoToInterface(item, prefix + 1)).join('\n') + '\n'
  }
  let value = ''
  if (obj.paramType === '13') {
    value = `${obj.paramKey}: {${getChildContent(obj, prefix)}${getPrefixValue(prefix)}}`
  } else if (obj.paramType === '12') {
    value = `${obj.paramKey}: Array<{${getChildContent(obj, prefix)}${getPrefixValue(prefix)}}>`
  } else {
    value = `${obj.paramKey}: ${paramTypeMap[obj.paramType]}` + (obj.paramName ? ` // ${obj.paramName}` : '')
  }
  return `${getPrefixValue(prefix)}${value}`
}
// eolink请求回来的参数格式化
function formatInfoData (item: any): EolinkApiInfoItem {
  return {
    field: item.paramKey,
    valueType: item.paramType,
    description: item.paramName,
    children: item.childList ? item.childList.map((child: any) => formatInfoData(child)) : null
  }
}
function analysisApiInfo (apiInfo: any): EolinkGetApiDetailResult {
  const apiUrl = apiInfo?.baseInfo?.apiURI
  const urlParams = apiInfo?.urlParam || []
  const requestBodyInfo = apiInfo?.requestInfo || []
  const resultInfo = apiInfo?.resultInfo?.[0].paramList?.[2]?.childList || apiInfo?.resultInfo?.[0].paramList || []
  let resultInfoInterface = `{\n${resultInfo.map((item: any) =>formatInfoToInterface(item)).join('\n')}\n}`
  let urlParamInterface = `{\n${urlParams.map((item: any) =>formatInfoToInterface(item)).join('\n')}\n}`
  let bodyParamsInterface = `{\n${requestBodyInfo.map((item: any) =>formatInfoToInterface(item)).join('\n')}\n}`

  return {
    apiUrl,
    apiName: apiInfo?.baseInfo?.apiName,
    apiRequestType: apiInfo?.baseInfo?.apiRequestType === 0 ? 'post' : 'get',
    result: resultInfo.map((item: any) => formatInfoData(item)),
    requestBody: requestBodyInfo.map((item: any) => formatInfoData(item)),
    requestQuery: urlParams.map((item: any) => formatInfoData(item)),
    resultInfoInterface,
    urlParamInterface,
    bodyParamsInterface
  }
}

export async function main(url: string) {
  try {
    const data = await getApiDetail(url)
    const info =  analysisApiInfo(data)
    return info
  } catch (error) {
    return Promise.reject(error)
  }
}

 