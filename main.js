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
                else return size.toFixed(2) + "B";
            };
        })
        .controller('MainController', MainController);

    MainController.$inject = ['$scope', '$interval'];

    function MainController($scope, $interval) {
        let vm = this;
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

        // 获取硬盘及分区信息
        // TODO: prefetch every disk's size
        drivelist.list((error, disks) => {
            if (error) throw error;
            let promises = [];
            for(let i=0; i<disks.length; i++) {
                if(!disks[i].mountpoint) continue;
                let mountpoint = disks[i].mountpoint.split(',');
                for(let j=0; j<mountpoint.length; j++) {
                    promises.push(getDiskMessage(mountpoint[j]))
                }
                Promise.all(promises).then(data => {
                    let k = 0;
                    for(let i=0; i<disks.length; i++) {
                        if(!disks[i].mountpoint) continue;
                        let mountpoint = disks[i].mountpoint.split(',');
                        disks[i].disks = [];
                        for(let j=0; j<mountpoint.length; j++) {
                            disks[i].disks[j] = data[k++];
                        }
                    }
                    // Disk itself size ... FIXME
                    getDiskMessage(mountpoint[0]).then(data => {
                        Object.assign(disks[i], data);
                        return disks;
                    });
                }).then().then(data => {
                    vm.disks = disks;
                    vm.os = os;
                });
                }
        });

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
            let length = stat.folder.length;
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

        // 获取挂载点的信息
        function getDiskMessage(disk) {
            // Read a mountpoint message
            return new Promise((resolve, reject) => {
                let sh, re;
                switch (os) {
                    case 'linux':
                        sh = 'df -h -k ' + disk;
                        re = /\s+(\d+)\s+(\d+)\s+(\d+)[%]/;
                        break;
                    default:
                        alert("Your system is not supported");
                }
                childProcess.exec(sh, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        console.error(`exec error: ${error}`);
                    } else {
                        let space = stdout.match(re);
                        resolve({
                            usedSpace: space[1] * 1024,
                            availableSpace: space[2] * 1024,
                            used: space[3] / 100,
                            mountpoint: disk
                        });
                    }
                });
            });
        }

        /**
        function analysisWithWorker(disk) {
            const worker = childProcess.fork('worker.js',{
                execArgv: ['--max_old_space_size=8192'] // increase v8's available memory to 4gb
            });
            vm.max = disk.usedSpace * 1024;
            worker.on('message',function(data) {
                console.log(data);
                switch(data.type) {
                    case 'processing':
                        vm.current = data.size;
                        break;
                    case 'end':
                        vm.current = vm.max;
                        vm.end = true;
                        break;
                    case 'result':
                        console.log(data);
                        vm.data = data;
                        break;
                    default:
                }
            });
            worker.send('/home/');
        }
        */

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
            root.max = disk.usedSpace;
            new Promise((resolve, reject) => {
                fs.lstat(root.path, (err, data) => {
                    if (err) {
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
            return new Promise((resolve, reject) => {
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
                                        stat.path = tree.path + fileName;
                                        stat.name = fileName;
                                        currentFile = stat.path;
                                        // ignore directory /proc
                                        if (stat.path === '/proc') {
                                            tree.fileCount++;
                                            stat.fileCount = 1;
                                            tree.file.push(stat);
                                            resolve(stat);
                                        } else if (stat.isDirectory()) {
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
                        Promise.all(promises).then(() => {
                            resolve(tree);
                        }).catch(err => {
                            log.push(err);
                            console.log(err);
                        });
                    }
                })
            }).then(tree => {
                return new Promise((resolve, reject) => {
                    if(tree === void 0) resolve(tree);
                    let promises = tree.folder.map(stat => {
                        return search(stat);
                    });
                    // datas 是文件夹处理结果
                    Promise.all(promises).then(datas => {
                        datas.map(stat => {
                            // 文件夹计算
                            if (stat && stat.isDirectory())  tree.folderCount += stat.folderCount + 1;
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
                });
            })
        }

        // What can I do to remove this?
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
            $timeout(() => {
                console.log(log);
            }, 0);
        }

    }
}());