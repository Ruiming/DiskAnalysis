var fs = require('original-fs');
var os = require('os').platform();
var drivelist = require('drivelist');
var d3 = require('d3');
const childProcess = require('child_process');

(function() {
    angular
        .module('diskanalysis', ['ui.bootstrap', 'nvd3'])
        .filter('size', function() {
            return function(size) {
                let kb = 1024;
                let mb = 1024 * 1024;
                let gb = mb * 1024;
                if(size > gb) return (size / gb).toFixed(2) + "GB";
                else if(size > mb) return (size / mb).toFixed(2) + "MB";
                else if(size > kb) return (size / kb).toFixed(2) + "KB";
                else return size + "B";
            };
        })
        .controller('MainController', MainController);

    MainController.$inject = ['$scope', '$interval', '$timeout', '$q'];

    function MainController($scope, $interval, $timeout, $q) {
        let vm = this;
        let mounted = [];
        // 状态显示
        vm.time = Date.parse(new Date()) / 1000;
        vm.start = false;
        vm.finish = false;
        vm.max = 0;
        vm.current = 0;
        // 显示磁盘
        vm.disks = null;
        // 分析结果
        vm.root = null;
        // 图标
        vm.icon = {
            'file': './images/file.svg',
            'folder': './images/folder.sve'
        };

        // 函数调用
        vm.analysis = analysis;
        vm.detail = detail;

        getMountpoints().then(result => {
            console.log(result);
            vm.disks = result;
        });

        // 获取硬盘及分区信息
        function getMountpoints() {
            return new $q((resolve, reject) => {
                let re = /(.+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)/g;
                let result = {}, mounted=[];
                childProcess.exec('df -Hlk | grep sd', (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        console.error(`exec error: ${error}`);
                    } else {
                        let space = stdout.match(re);
                        for(let i=0, length=space.length; i<length; i++) {
                            if(!(space[i] instanceof Array)) {
                                space[i] = space[i].split(/\s+/);
                            }
                            if(!result[space[i][0].match(/(\D+)/)[1]]) result[space[i][0].match(/(\D+)/)[1]] = [];
                            result[space[i][0].match(/(\D+)/)[1]].push({
                                filesystem: space[i][0],
                                used: space[i][2] * 1024,
                                available: space[i][3] * 1024,
                                capacity: space[i][4],
                                mountpoint: space[i][5]
                            });
                            mounted.push(space[i][5]);
                        }
                        for(let hd in result) {
                            if(result.hasOwnProperty(hd)) {
                                childProcess.exec(`sudo hdparm -I ${hd}`, (error, stdout, stderr) => {
                                    if(error) {
                                        reject(error);
                                        console.error(`exec error:${error}`);
                                    } else {
                                        let model = /Model\sNumber:\s+(.+)/;
                                        let serial = /Serial\sNumber:\s+(.+)/;
                                        let size = /1024\*1024:\s+(.+)MBytes/;  // MB
                                        result[hd]['model'] = stdout.match(model)[1].trim();
                                        result[hd]['serial'] = stdout.match(serial)[1].trim();
                                        result[hd]['size'] = +stdout.match(size)[1].trim() * 1024 * 1024;
                                        result[hd]['mountpoint'] = '';
                                        for(let i=0; i<result[hd].length; i++) {
                                            result[hd]['mountpoint'] += result[hd]['mountpoint']  ?  ', ' + result[hd][i]['mountpoint'] : result[hd][i]['mountpoint'];
                                        }
                                    }
                                    resolve(result);
                                })
                            }
                        }
                        // ignore '/proc' in Linux
                        mounted.push('/proc');
                        resolve(result);
                    }
                });
            });
        }

        function detail(stat) {
            stat.more = !stat.more;
            vm.stat = stat;
            // 饼图显示容量分析结果
            vm.options = {
                title: {
                    enable: true,
                    text: "Analysis of Folder's Size"
                },
                chart: {
                    type: 'pieChart',
                    height: 350,
                    x: function(d){return d.key;},
                    y: function(d){return d.y;},
                    legendPosition: "right",
                    showLabels: true,
                    duration: 500,
                    labelThreshold: 0.01,
                    labelSunbeamLayout: true,
                    yAxis: {
                        axisLabel: 'Values',
                        tickFormat: function(d){
                            return d3.format('%')(d);
                        }
                    },
                    tooltip: {
                        valueFormatter: function (d, i) {
                            return (d*100).toFixed(2) + "%";
                        }
                    }
                }
            };
            vm.data = [];
            // 柱形图显示平均年龄
            vm.options2 = {
                chart: {
                    type: 'discreteBarChart',
                    height: 250,
                    x: function(d){return d.label;},
                    y: function(d){return d.value;},
                    showValues: true,
                    duration: 500,
                    yAxis: {
                        "axisLabel": "Y Axis",
                        "axisLabelDistance": -10
                    },
                    tooltip: {
                        valueFormatter: function (d, i) {
                            let kb = 1024;
                            let mb = 1024 * 1024;
                            let gb = mb * 1024;
                            if(d > gb) return parseInt(d / gb)  + " GB";
                            else if (d > mb) return parseInt(d / mb) + " MB";
                            else if (d > kb) return parseInt(d / kb) + " KB";
                            else return parseInt(d) + " B";
                        }
                    }
                }
            };
            vm.data2 = [{
                key: "Cumulative Return",
                values: []
            }];
            // 填充
            let length = stat.folder && stat.folder.length || 0;
            let restSize = stat.size;
            for(let i=0; i<length; i++) {
                restSize -= stat.folder[i].size || 0;
                vm.data.push({
                    key: stat.folder[i].name,
                    y: stat.folder[i].size / stat.size
                });
                vm.data2[0].values.push({
                    label: stat.folder[i].name,
                    value: parseInt(stat.folder[i].size)
                });
            }
            vm.data.push({
                key: '文件',
                y: restSize / stat.size
            });
            vm.data2[0].values.push({
                label: '文件',
                value: parseInt(restSize)
            });
        }


        function analysis(disk) {
            vm.start = true;
            // TODO: 统一K为单位
            var startTime = new Date().getTime();
            let mp = disk.mountpoint.split(',');
            // TODO: multi mountpoint ?
            root.path = mp[0];
            // root.path = '/home/ruiming/Dropbox/';
            root.name = mp[0];
            if(root.path[root.path.length - 1] !== '/') {
                root.path += '/';
            }
            // 遍历以B计算
            root.max = disk.used;
            new $q((resolve, reject) => {
                fs.lstat(root.path, (err, data) => {
                    if (err) {
                        console.log(err);
                        log.push(err);
                        reject(err);
                    } else {
                        Object.assign(root, data, {file: [], folder: [], size: 0, age: 0, fileCount: 0, folderCount: 0});
                        resolve(root);
                    }
                });
            }).then(root => search(root))
                .then(() => {
                    var endTime = new Date().getTime();
                    let usedTime = endTime - startTime;
                    calc = root.size;
                    root.max = root.size;
                    root.startTime = startTime;
                    root.endTime = endTime;
                    root.usedTime = usedTime;
                    console.log(root);
                    console.log(log);
                });
        }

        var root = {};
        var log = [];
        var calc = 0;
        var currentFile = null;

        function search(tree) {
            return new $q((resolve, reject) => {
                fs.readdir(tree.path, (err, data) => {
                    // Use resolve to avoid Promise.all no work
                    if (err) {
                        log.push(err);
                        resolve();
                    } else {
                        let promises = data.map(fileName => {
                            return new Promise((resolve, reject) => {
                                fs.lstat(tree.path + fileName, (err, stat) => {
                                    if (err) {
                                        log.push(err);
                                        resolve();
                                    } else {
                                        let mini = {
                                            size: stat.size,
                                            isDirectory: stat.isDirectory()
                                        };
                                        stat = mini;
                                        stat.path = tree.path + fileName;
                                        stat.name = fileName;
                                        currentFile = stat.path;
                                        if (mounted.indexOf(stat.path) !== -1) {
                                            tree.fileCount++;
                                            stat.fileCount = 1;
                                            tree.file.push(stat);
                                            resolve(stat);
                                        } else if (stat.isDirectory) {
                                            stat.path += '/';
                                            stat.folderCount = 0;
                                            stat.folder = [];
                                            stat.file = [];
                                            stat.fileCount = 0;
                                            tree.folder.push(stat);
                                        } else {
                                            // 用于计算进度
                                            calc += stat.size;
                                            // 文件数/容量(文件)/年龄计算
                                            tree.size += stat.size;
                                            tree.fileCount++;
                                            stat.fileCount = 1;
                                            tree.file.push(stat);
                                        }
                                        resolve(stat);
                                    }
                                })
                            });
                        });
                        $q.all(promises).then(() => {
                            resolve(tree);
                        }).catch(err => {
                            log.push(err);
                            console.log(err);
                        });
                    }
                })
            }).then(tree => {
                return new $q((resolve, reject) => {
                    if(tree === void 0 || tree.folder === void 0) resolve(tree);
                   else {
                        let promises = tree.folder.map(stat => {
                            return search(stat);
                        });
                    // datas 是文件夹处理结果
                    $q.all(promises).then(datas => {
                        datas.map(stat => {
                            // 文件夹计算
                            if (stat && stat.isDirectory)  tree.folderCount += stat.folderCount + 1;
                            // 容量计算
                            if (stat) {
                                tree.size += stat.size;
                                tree.fileCount += stat.fileCount;
                            }
                        });
                        resolve(tree);
                    }).catch(err => {
                        log.push(err);
                    });
                }});
            })
        }

        // TODO
        vm.test = $interval(() => {
            vm.max = root.max;
            vm.current = calc;
            vm.currentFile = currentFile;
            if(vm.current === vm.max) {
                vm.root = root;
                vm.finish = true;
            }
        }, 50);

        if(vm.finish) {
            $interval.clearInterval(vm.test);
        }

    }
}());