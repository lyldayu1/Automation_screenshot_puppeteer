'use strict'

require('console-stamp')(console, { pattern: 'dd/mm/yyyy HH:MM:ss.l' })
const express = require('express')
const { URL } = require('url')
const contentDisposition = require('content-disposition')
const createRenderer = require('./renderer')




const port = process.env.PORT || 3000
const disable_url = process.env.DISABLE_URL || false
const disable_auth = process.env.DISABLE_AUTH || false
const healthcheck_url = process.env.HEALTHCHECK_URL || false
const protocol_env = process.env.PROTOCOL || false
const base_host = process.env.SSM_NAMESPACE || false
const ttl_time=process.env.TTL_TIME || 3600
const healthcheck_ttl=3600*24
const NodeCache = require("node-cache");
const myCache=new NodeCache({stdTTL: Number(ttl_time), checkperiod:120});
var interval=1000*60*30;
var cache_interval=1000*60*60*2;
var gc_interval=1000*60*30


let authentication=null;
if(disable_auth==false){
  const Auth = require('./auth')
  authentication = new Auth()
  authentication.syncSecret()
}

const app = express()

let renderer = null

// Configure.
app.disable('x-powered-by')

// Render url.
app.use(async (req, res, next) => {
  let { url, uri, type, disable_cache, token, ttl, ...options } = req.query
  if(uri){
    let parcel_index=uri.indexOf('parcel_name')
    let drillview_index=uri.indexOf('drillview');
    if(parcel_index>-1){
      console.log(uri);
      let embedded_index=uri.indexOf('embedded')
      let parcelvalue_encode=encodeURIComponent(uri.substring(parcel_index+12,embedded_index-1))
      uri=uri.substring(0,parcel_index+12)+parcelvalue_encode+uri.substring(embedded_index-1);
    }else if(drillview_index>-1){
      console.log(uri);
      let firstAnd=uri.substring(drillview_index).indexOf('&');
      if(firstAnd>-1){
        let drillvalue_encode=encodeURIComponent(uri.substring(drillview_index+10,firstAnd))
        uri=uri.substring(0,drillview_index+10)+drillvalue_encode+uri.substring(firstAnd);
        console.log(uri);
      }else{
        let drillvalue_encode=encodeURIComponent(uri.substring(drillview_index+10))
        uri=uri.substring(0,drillview_index+10)+drillvalue_encode;
        console.log(uri);
      }
    }
  }
  // if(uri){
  //   console.log(uri);
  //   uri=encodeURIComponent(uri);
  //   console.log(uri);
  // }
  //uri=encodeURIComponent(uri)
  if (req.url == '/healthcheck') {
    console.log("request ip:" +req.ip);
    console.log("request hostname" + req.hostname);
    try {
      if (!healthcheck_url) {
        url = 'https://www.google.com'
      } else {
        url = healthcheck_url
      }
      console.info('Health check called, visiting url: ' + url)
      let html=null;
      if(disable_cache=="true"){
        html = await renderer.render(url, options)
        if(html==null){
          return res.status(500).send('Oops, An unexpected error seems to have occurred: browser lose')
        }
      }else{
        let healthCache=myCache.get(url);
        if(healthCache==undefined){
            html= await renderer.render(url, options)
            if(html==null){
              return res.status(500).send('Oops, An unexpected error seems to have occurred: browser lose')
            }
            myCache.set(url,html,healthcheck_ttl);             
        }else{
            html=healthCache;
        }
      }
      // const html = await renderer.render(url, options)
      // if(html==null){
      //   return res.status(500).send('Oops, An unexpected error seems to have occurred: browser lose')
      // }   
      return res.status(200).send(html)
    } catch (e) {
      next(e)
    }
  }
  if (!url && !uri) {
    return res
      .status(400)
      .send('Search with url or uri parameter. For eaxample, ?url=http://yourdomain, ?uri=/')
  }

  //  if (!url.includes('://')) {
  //    url = `http://${url}`
  //  }
  let url_protocol = req.protocol
  if(protocol_env){
	  url_protocol = protocol_env
  }
  if (disable_url && disable_url.toLowerCase() == 'true') {

    if (!uri) {
      return res.status(400).send('url disabled, please use uri')
    }
    if (!uri.startsWith("/analytics/ui/#/explore") && !uri.startsWith("/analytics/ui/#/dashboards") && !uri.startsWith("/analytics/ui/#/widgets")){
      return res.status(400).send('uri: '+ uri + ' is not allowed, use explore/dashboards')
    }
    
    if(!base_host) {
    	url = url_protocol + '://' + req.get('host') + uri
    } else {
    	url = url_protocol + '://' + base_host + '/' + uri
    }
    
    if(token){
    	if(url.indexOf('?') > -1) {
    	 url = url + "&token="+token
    	} else {
    	 url = url + "?token="+token	
    	}
    }
  } else if (!url) {
    url = url_protocol + '://' + req.get('host') + uri
  }

  console.log('Url:', url)

  if (!token) {
    var str = req.get('authorization')
    if (str) {
      var arr = str.trim().split(' ')
      token = arr[arr.length - 1]
    }
  }

  if (!disable_auth || disable_auth.toLowerCase() !== 'true') {
    authentication.authToken(token, res)
  }

  const { timeout, waitUntil,height, width, delay, ...extraOptions } = options

  try {
    switch (type) {
      case 'pdf':
        const urlObj = new URL(url)
        let filename = urlObj.hostname
        if (urlObj.pathname !== '/') {
          filename = urlObj.pathname.split('/').pop()
          if (filename === '') filename = urlObj.pathname.replace(/\//g, '')
          const extDotPosition = filename.lastIndexOf('.')
          if (extDotPosition > 0) filename = filename.substring(0, extDotPosition)
        }
        
        let pdf=null;
        //get latest page 
        if(disable_cache=="true"){
          pdf = await renderer.pdf(url, options)
          if(pdf==null){
            return res.status(500).send('Oops, An unexpected error seems to have occurred: browser lose')
          }             
        }else{//get page from cache
          let pdf_path=url+'_'+height+'_'+width+'_'+delay+'_pdf';
          console.log(pdf_path);
          let pdfCache=myCache.get(pdf_path);
          if(pdfCache==undefined){
            pdf = await renderer.pdf(url, options)
            if(pdf==null){
              return res.status(500).send('Oops, An unexpected error seems to have occurred: browser lose')
            }
            if(ttl==undefined){
              myCache.set(pdf_path,pdf,ttl_time);
            }else{
              myCache.set(pdf_path,pdf,ttl);
            }              
          }else{
            pdf=pdfCache;
          }
        }
        res
          .set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdf.length,
            'Content-Disposition': contentDisposition(filename + '.pdf'),
          })
          .send(pdf)
        break

      case 'screenshot':
        
        let image=null;
        // get latest page
        if(disable_cache=="true"){ 
          image = await renderer.screenshot(url, options)
          if(image==null){
            return res.status(500).send('Oops, An unexpected error seems to have occurred: browser lose')
          }                    
        }else{  // get page from cache
          let image_path=url+'_'+height+'_'+width+'_'+delay+'_image';
          console.log(image_path);
          let imageCache=myCache.get(image_path);       
          if(imageCache==undefined){
            image = await renderer.screenshot(url, options)
            if(image==null){
              return res.status(500).send('Oops, An unexpected error seems to have occurred: browser lose')
            }
            if(ttl==undefined){
              myCache.set(image_path,image,ttl_time);
            }else{
              myCache.set(image_path,image,ttl);
            }        
          }else{
            image=imageCache;
          } 
        }
        res
          .set({
            'Content-Type': 'image/png',
            'Content-Length': image.length,
          })
          .send(image)    
        break

      default:
        const html = await renderer.render(url, options)
        if(html==null){
          return res.status(500).send('Oops, An unexpected error seems to have occurred: browser lose')
        }
        res.status(200).send(html)
    }
  } catch (e) {
    next(e)
  }
})

// Error page.
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).send('Oops, An unexpected error seems to have occurred: ' + err.message)
})

// Create renderer and start server.
createRenderer()
  .then(createdRenderer => {
    renderer = createdRenderer
    console.info('Initialized renderer.')

    app.listen(port, () => {
      console.info(`Listen port on ${port}.`)
    })
  })
  .catch(e => {
    console.error('Fail to initialze renderer.', e)
  })

setInterval(async function(){
  let heapUsed = process.memoryUsage().heapUsed;
  console.log("before restart browser Program is using " + heapUsed + " bytes of Heap.")
  await renderer.restart();
  heapUsed = process.memoryUsage().heapUsed;
  console.log("after restart browser Program is using " + heapUsed + " bytes of Heap.")
  //global.gc();
},interval);

setInterval(function(){
  let heapUsed = process.memoryUsage().heapUsed;
  console.log("before clear cache Program is using " + heapUsed + " bytes of Heap.")
  myCache.flushAll();
  heapUsed = process.memoryUsage().heapUsed;
  console.log("after clear cache Program is using " + heapUsed + " bytes of Heap.")
},cache_interval);

setInterval(function(){
  let heapUsed = process.memoryUsage().heapUsed;
  console.log("before gc Program is using " + heapUsed + " bytes of Heap.")
  global.gc();
  heapUsed = process.memoryUsage().heapUsed;
  console.log("after gc Program is using " + heapUsed + " bytes of Heap.") 
},gc_interval);


// Terminate process
process.on('SIGINT', () => {
  myCache.flushAll();
  myCache.close();
  process.exit(0)
})
