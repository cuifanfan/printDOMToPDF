/**
 *   @Author cuifan
 *   @Date 2023/11/13
 *   @Description:  文件导出方法
 */

import http from '@/api/http';
const PDF_DEFAULT_URL = `/v1/pdfgenerator/point_graph`;
/**
 * @description 克隆指定节点并返回HTML（包含样式）
 * @targetNode {HTMLElement} 被克隆的节点
 * @handler {Callback} 对克隆的节点进行处理的回调
 *          @el {HTMLElement}克隆出的节点
 *          @document {Document} 新创建的文档
 * @return {String} 返回克隆出节点的 html 字符串
 * */
export function getHTMLStr(targetNode, handler) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const _d = iframe.contentWindow.document;
    const newDocument = _d.implementation.createHTMLDocument();
    const newHead = newDocument.head, newBody = newDocument.body;
    // 克隆样式
    Array.from(document.styleSheets).forEach(stylesheet => {
        if (stylesheet.href) {
            const newLink = newDocument.createElement('link');
            newLink.rel = 'stylesheet';
            newLink.href = stylesheet.href;
            newHead.appendChild(newLink);
        } else if (stylesheet instanceof CSSStyleSheet) {
            const newStyle = newDocument.createElement('style');
            newStyle.textContent = Array.from(stylesheet.cssRules)
                .map(rule => rule.cssText).join('');
            newHead.appendChild(newStyle);
        }
    });
    // 克隆节点并执行回调处理该节点
    const clonedNode = targetNode.cloneNode(true);
    handler && handler(targetNode, clonedNode);
    newBody.appendChild(clonedNode);
    // 获取HTML文本
    const htmlContent = newDocument.documentElement.outerHTML;
    document.body.removeChild(iframe);
    return htmlContent;
}

/**
 * @description 下载blob对象为文件
 * @param 导出文件名称
 * @param Blob对象
 * */
export function download(name, blob) {
    const _a = document.createElement('a');
    const URL = window.URL || window.webkitURL;
    _a.href = URL.createObjectURL(blob);
    _a.download = name;
    document.body.appendChild(_a);
    _a.click();
    document.body.removeChild(_a);
    URL.revokeObjectURL(_a.href);
}

/**
 * @description 根据配置信息下载PDF
 * @param base64 base64字符串
 * @return Blob blob对象
 * */
export function base64ToBlob(base64 = 'data:;base64,') {
    const arr = base64.split(',');
    const type = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    let n = bstr.length;
    while(n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], {type});
}

/**
 * @description 根据配置信息下载PDF
 * @param name PDF名称
 * @param url 导出服务地址
 * @param host 静态资源地址
 * @param PDF 导出信息
 * @param width PDF宽
 * @param height PDF高
 * @param scale 缩放倍数
 * */
export async function pdfDownload({url = PDF_DEFAULT_URL, name, ...data}) {
    const pdfResponse = await http.post(url, data, {
        responseType: 'blob',
    });
    download(name, pdfResponse);
}

/**
 * @description 导出Excel
 * @param name Excel名称
 * @param url 导出服务地址
 * @param data 数据
 * */
export async function excelDownload({url, name, data}) {
    const excelResponse = await http.post(url, data, {
        responseType: 'blob',
    });
    download(name, excelResponse);
}

export default {
    getHTMLStr,
    base64ToBlob,
    pdfDownload,
    excelDownload,
    download,
};
