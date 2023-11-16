# 写在前面

在前端开发中，HTML转PDF是常见需求，这一块儿有两个常见的插件：html2canvas和jspdf，但这种纯前端打印的方式有一些缺点：

1. PDF清晰度不高，模糊
2. 多页PDF会出现内容分割
3. 页面较宽或较长时，PDF打印内容不全

因此，笔者经过一些调研之后，决定采用无头浏览器的方式生成PDF，最终代码运行在BFF层，公司内部其他系统也可以接入。

无头浏览器学习地址：

- [Puppeteer 中文网 (nodejs.cn)](https://pptr.nodejs.cn/)
- [Puppeteer 简介 | Puppeteer 中文文档 | Puppeteer 中文网 (bootcss.com)](https://puppeteer.bootcss.com/)

# 项目代码

https://github.com/cuifanfan/pdf_html_node

# 环境依赖：

## Node版本

```js
nvm use 18.9.0
```

## 打包工具

```shell
npm i -g pkg@5.8.1
```

## 安装依赖

```shell
npm i
```

# 打包

## `win`平台：

```shell
pkg .\pdfgenerator.js -t win -o pdfgenerator
```

# 配置文件说明

## puppeteer.config.cjs

更改 `Puppeteer` 用于安装浏览器的默认缓存目录。

## pdfgenerator.config.json

服务配置信息，如端口、日志大小限制等

## .cache

`Puppeteer`使用的无头浏览器缓存目录

## pdfgenerator.vbs

隐藏`pdfgenerator.exe`服务窗口

# 导出多页HTML字符串为PDF

## 接口功能描述

## 请求内容

| 请求方法 | 请求URI      | URI示例                      |
| -------- | ------------ | ---------------------------- |
| POST     | /point_graph | /v1/pdfgenerator/point_graph |

## 请求参数

| 字段         | 类型   | 是否必传 | 默认值    | 备注                     |
| ------------ | ------ | -------- | --------- | ------------------------ |
| htmlContents | Array  | 否       | []        | 需要打印的HTML字符串数组 |
| width        | Number | 否       | 485       | 输出PDF每页的宽度        |
| height       | Number | 否       | 275       | 输出PDF每页的高度        |
| host         | String | 否       | /v1/file/ | 第三方静态资源主机地址   |

## 返回内容

> responseType为Arraybuffer.

```js
Response {
    body:ReadableStream,
    bodyUsed:true,
    headers:Headers{},
    ok:true,
    redirected:false,
    statusText:'OK',
    type:'cors',
    url:'http://127.0.0.1:16695/v1/pdfgenerator/point_graph'
}
```

前端代码示例：

```js
/**
 * 
 * @param {Object} 配置参数
 *        @param url: 后台服务地址
 *        @param data: {
                    htmlContents: html字符串组成的数组
                    host: 第三方静态资源地址（比如图片、CSS等其他url）
                    width: 导出PDF每页的宽
                    height: 导出PDF每页的高
                  }
 *        @param fileName: pdf的名称
 */
async function printPage({ url, data, fileName }) {
  const response = await fetch(url, {
    method: 'post',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json'
    },
    responseType: 'arraybuffer'
  });
  // 转为 buffer
  const buffer = await response.arrayBuffer();
  const _a = document.createElement('a');
  const URL = window.URL || window.webkitURL;
  _a.href = URL.createObjectURL(new Blob([buffer], { type: 'arraybuffer' }));
  _a.download = fileName + '.pdf';
  document.body.appendChild(_a);
  _a.click();
  document.body.removeChild(_a);
  window.URL.revokeObjectURL(_a.href);
}

// 填充内容并导出整个页面中某些元素
const page1 = document.getElementById('page1');
const table1 = ['time', 'product', 'station', 'color', 'VIN'];
const table2 = ['defects', 'hood', 'trunk_Lid', 'fender_L', 'fender_R', 'front_Door_L', 'front_Door_R', 'rear_Door_L', 'rear_Door_R', 'side_Panel_L', 'side_Panel_R', 'roof'];
(async () => {
  const count = 1;
  const url = 'http://127.0.0.1:16695/v1/pdfgenerator/point_graph';
  const fileName = 'cuifanfan' + Math.random();
  const data = {
    htmlContents: [],
    host: 'http://172.17.17.38:8081/Desktop/htmltemplate/',
    width: page1.clientWidth + 190,
  }
  for (let i = 0; i < count; i++) {
    const ids = [...table1, ...table2];
    for (const id of ids) {
      const el = document.getElementById(id);
      el.innerText = id + i;
    }
    data.htmlContents = [document.documentElement.outerHTML];
    await printPage({ url, fileName, data })
  }
})()
```
>>>>>>> a8f3ebc (修改范围：Node无头浏览器PDF导出服务)

