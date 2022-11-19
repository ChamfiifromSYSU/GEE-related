/*
author: shenqh from SYSU   AKA 小穆的脑残粉
time: 2022-11-10
description: KMeans++ basic implementation on Google Earth Engine
*/



// 以下是数据获取，modis填补sentinel2 ndvi序列，不多注释

geometry = geometry3
var cdl2021 = ee.ImageCollection('USDA/NASS/CDL')
    .filter(ee.Filter.date('2021-01-01', '2021-12-31'))
    .first();
var cropland21 = cdl2021.select('cultivated').eq(2).clip(geometry)

var cdl2020 = ee.ImageCollection('USDA/NASS/CDL')
    .filter(ee.Filter.date('2020-01-01', '2020-12-31'))
    .first();
var cropland20 = cdl2020.select('cultivated').eq(2).clip(geometry)

var cdl2019 = ee.ImageCollection('USDA/NASS/CDL')
    .filter(ee.Filter.date('2019-01-01', '2019-12-31'))
    .first();
var cropland19 = cdl2019.select('cultivated').eq(2).clip(geometry)

/* ----------------------- S2 settings ----------------------------------*/
var getNDVI = function(img) {
  var ndvi = img.normalizedDifference(['B8','B4']).rename('NDVI')
  return img.addBands(ndvi)
}

// var s2_cloudy50 = ee.ImageCollection("COPERNICUS/S2_SR")
//                   .filterBounds(geometry2)
//                   .filterDate('2019-01-01', '2022-01-01')
//                   .filterMetadata('CLOUDY_PIXEL_PERCENTAGE',"greater_than",50);
// Map.addLayer(s2_cloudy50, {}, "s2_cloudy50")
function maskS2clouds(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask).divide(10000).copyProperties(image,['system:time_start']);
}

geometry = geometry3
var pt = ee.Geometry.Point([-98.276171875,45.20115931009764])
Map.addLayer(pt, null,'pt',false)
var year = 2021
var s2 = ee.ImageCollection("COPERNICUS/S2_SR")
          .filterBounds(pt)
          .filterDate(year+"-01-01", year+'-12-31')
          .map(maskS2clouds)      
          .map(getNDVI)
          .select("NDVI")


var year = 2021
var s2_halfmonth = ee.List.sequence(1,12).map(function(item){
  var start_date = ee.Date.fromYMD(year, item, 1);
  var mid_date = start_date.advance(15,'day');
  var end_date = start_date.advance(1,'month');
  var pre_month_img = s2.filterDate(start_date,mid_date).mean()
                            .set('system:time_start',start_date.millis())
                            .set('time',start_date.format('YYYY-MM-dd'));
  var pro_month_img = s2.filterDate(mid_date,end_date).mean()
                            .set('system:time_start',start_date.millis())
                            .set('time',mid_date.format('YYYY-MM-dd'));  
  return ee.ImageCollection([pre_month_img,pro_month_img]);
});

// define iterate function
function accumulate(imageCol, list) {
  return ee.ImageCollection(list).merge(imageCol);
}
// flatten each element in the l8_halfmonth collection
var s2_halfmonth = s2_halfmonth.iterate(accumulate,ee.ImageCollection([]));
var s2_halfmonth= ee.ImageCollection(s2_halfmonth);
// print('s2_halfmonth',s2_halfmonth)


/* ----------------------- S2 settings ----------------------------------*/


/* ----------------------- modis settings ----------------------------------*/

var getModisNDVI = function(img) {
  var ndvi = img.normalizedDifference(['sur_refl_b02','sur_refl_b01']).rename('NDVI');
  return img.addBands(ndvi);
};
var modis = ee.ImageCollection("MODIS/061/MOD09Q1")

var year = 2021
var modis_halfmonth = ee.List.sequence(1,12).map(function(item){
  var start_date = ee.Date.fromYMD(year, item, 1);
  var mid_date = start_date.advance(15,'day');
  var end_date = start_date.advance(1,'month');
  var pre_month_img = modis.filterDate(start_date,mid_date).mean()
                            .set('system:time_start',start_date.millis())
                            .set('time',start_date.format('YYYY-MM-dd'));
  var pro_month_img = modis.filterDate(mid_date,end_date).mean()
                            .set('system:time_start',start_date.millis())
                            .set('time',mid_date.format('YYYY-MM-dd'));  
  return ee.ImageCollection([pre_month_img,pro_month_img]);
});

// define iterate function
function accumulate(imageCol, list) {
  return ee.ImageCollection(list).merge(imageCol);
}
// flatten each element in the l8_halfmonth collection
var modis_halfmonth = modis_halfmonth.iterate(accumulate,ee.ImageCollection([]));
var modis_halfmonth= ee.ImageCollection(modis_halfmonth).map(getModisNDVI).select(['NDVI']);
// print('modis_halfmonth',modis_halfmonth)


var idx = modis_halfmonth.first().get('system:index')
var s2_img = s2_halfmonth.filterMetadata('system:index', 'equals', idx).toBands()
var modis_s2_ndvi = modis_halfmonth.map(function(img) {
  var idx = img.get('system:index')
  img = img.reproject('EPSG:4326',null,250)
  var img_s2 = s2_halfmonth.filterMetadata('system:index', 'equals', idx).toBands()
  return img.blend(img_s2)
})
print('modis_s2_ndvi',modis_s2_ndvi)

var palettes = require('users/gena/packages:palettes');
var palette = palettes.colorbrewer.RdYlGn[8];

Map.addLayer(s2_halfmonth.toBands().clip(geometry).select(8), {min:0,max:1,palette:palette}, 's2_halfmonth first')
Map.addLayer(modis_s2_ndvi.toBands().clip(geometry3).select(8), {min:0,max:1,palette:palette}, 'modis_s2_ndvi first')


/* ----------------------- modis settings ----------------------------------*/

//以上就是为了得到一个没有nan值的ndvi序列作为输入


var input = modis_s2_ndvi.toBands().clip(geometry)

var idx_list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
var name_list = ['NDVI_1', 'NDVI_2', 'NDVI_3', 'NDVI_4', 'NDVI_5', 'NDVI_6', 'NDVI_7', 'NDVI_8',
'NDVI_9', 'NDVI_10', 'NDVI_11', 'NDVI_12', 'NDVI_13', 'NDVI_14', 'NDVI_15', 'NDVI_16',
'NDVI_17', 'NDVI_18', 'NDVI_19', 'NDVI_20', 'NDVI_21', 'NDVI_22', 'NDVI_23', 'NDVI_24']
input = input.select(idx_list, name_list)

print(input)

// 在cdl的农田范围内采一些点
var training_pts = cropland21.stratifiedSample({
  numPoints : 1000,
  classBand : "cultivated",
  region : geometry,
  scale :10,
  geometries :true
});


// print(training_pts, "training_pts before filter")
training_pts = training_pts.filter("cultivated == 1")
// print(training_pts, "training_pts")

// print(training_pts.filterMetadata('cultivated', 'equals', 1))

var training = input.sample({
  region: training_pts,
  scale: 10,
  numPixels: 1000,
  tileScale:8,
 geometries:true,
 dropNulls: false,
  
});



var propertyName = training.first().propertyNames().removeAll(['system:index'])

// makeArray：把ndvi序列属性转化为数组，方便输入
var arr = training.makeArray(propertyName).select('array').limit(100)   // 太多点还聚不动，先限制为100个
arr = arr.toList(arr.size())
var arr_ls = arr.map(function(f) {
  return ee.Feature(f).get('array')
})
print(arr_ls)


// 关于输入数据的一些设定，data为输入数据，data_size是数据数目，data_len是一条数据的长度，这里用的半月合成ndvi，所以24条
var data = arr_ls
var data_size = 100
var data_len = 24


// Euclidean Distance，可自行替换为其他距离（自己写的意思）
function calDist(a, b) {
  var c = a.subtract(b);
  var cc = c.multiply(c).accum(0);
  return cc.get([-1]).sqrt()
}


// 关于kmeans的一些设定
var rand = Math.random()
var rand_idx = Math.floor(rand*data_size) // Kmeans++需要随机选一个点作为第一个聚类中心.

var k = 4; // 聚类数
var iter_times = 5; // 迭代次数

var center_idx = ee.List.sequence(0,null,1,k)

var id_0 = ee.Number(rand_idx)
var center = ee.List.repeat(data.get(id_0),k) // 初始化聚类中心
var dists = ee.List.repeat(0,k) // 初始化距离各个聚类中心的距离

// KMeans++ initialization： KMeans++就是改进在初始化聚类中心的方式，随机选了一个之后迭代出剩下的初始聚类中心
var INDEXS =  ee.List.sequence(0,null,1,data_size)
INDEXS = INDEXS.splice(id_0,1)

// 获取下一个聚类中心
var get_next_center = function(INDEXS, idd) {
  var dist_list = INDEXS.map(function (i) {
    return calDist(ee.Array(data.get(i)),  ee.Array(center.get(idd)))
  })
  var dist_accum = ee.Array(dist_list).accum(0)
  var prop_rand1 = ee.Number(Math.random()).multiply(dist_accum.get([-1]))
  dist_accum = dist_accum.gt(prop_rand1)  // KMeans++的核心：按照距离，随机选下一个，而不是直接选距离最大的一个，避免离群点。距离大的被选中的概率就大
  return dist_accum.toList().indexOf(ee.Number(1))
}

// 已经选过的，就从备选列表中remove
for (var i = 0; i < k-1; i++) {
  var next_center = get_next_center(INDEXS, i)
  center = center.set(i+1, data.get(next_center))
  INDEXS = INDEXS.remove(next_center)
}

// 这是为了获取索引，算是实现了类似numpy的 np.where(temp_y == c)这样的功能（后来发现gee也有where，不知是否可用）
// 如[0,1,1,2,2,0]，要获取2的索引，就得到[999,999,999,3,4,999]，后面再remove掉999，就得到了2的索引[3,4]
var get_condition = function(c) {
  var condition = function(f) {
    return ee.Algorithms.If(ee.Number(temp_y.get(f)).eq(c), ee.Number(f), ee.Number(999));
  }
  return condition
}

// 用来更新聚类中心，
var arr_sum = function (f, first) {
  var a = ee.Array(data.get(f))
  return a.add(first)
}

// start iteration
for (var i = 0; i < iter_times; i++) {
  var temp_y = ee.List([]);
  for (var j = 0; j < data_size; j++) {
  	// 每条数据计算一下跟center的距离
    for (var center_id = 0; center_id < k; center_id++) {
      dists = dists.set(center_id, calDist(ee.Array(data.get(j)), ee.Array(center.get(center_id))))
    }
    // 跟哪个center距离最小，就归到对应类别上
    var min_dist = dists.reduce(ee.Reducer.min())
    var idx = dists.indexOf(min_dist)
    temp_y = temp_y.add(idx);
  }
  
  // update_center： 重新计算聚类中心
  for (var center_id = 0; center_id < k; center_id++) {
    var condition = get_condition(center_id)
    var idx_0 = ee.List.sequence(0,null,1,data_size).map(condition).removeAll(ee.List([999]))
    var cluster_0 = idx_0.iterate(arr_sum, ee.Array(ee.List.repeat(0,data_len)))
    center = center.set(center_id, ee.Array(cluster_0).divide(idx_0.length()))
  }

}
print(temp_y)

// todo: 在Image上的推理过程（每个点上序列计算和center的距离，归为最近那类）