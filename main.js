var fs = require('original-fs');
var os = require('os').platform();
var drivelist = require('drivelist');
var d3 = require('d3');
const childProcess = require('child_process');

(function () {
    angular
        .module('diskanalysis', ['ui.bootstrap', 'nvd3'])
        .filter('size', function () {
            return function (size) {
                let kb = 1024;
                let mb = 1024 * 1024;
                let gb = mb * 1024;
                if (size > gb) return (size / gb).toFixed(2) + "GB";
                else if (size > mb) return (size / mb).toFixed(2) + "MB";
                else if (size > kb) return (size / kb).toFixed(2) + "KB";
                else return size + "B";
            };
        })
        .controller('MainController', MainController);

    MainController.$inject = ['$scope', '$interval', '$timeout', '$q'];

    function MainController($scope, $interval, $timeout, $q) {
        let vm = this;
        // 状态显示
        vm.time = Date.parse(new Date()) / 1000;
        vm.start = false;       // 开始标志
        vm.finish = false;      // 结束标志
        vm.max = 0;             // 根总容量
        vm.current = 0;         // 根当前计算容量
        vm.root = {};           // 根
        vm.mounted = [];        // 挂载点
        vm.log = [];            // 日志
        vm.currentFile = null;  // 当前分析的文件
        vm.disks = null;        // 磁盘
        vm.icon = {             // 图标
            'file': './images/file.svg',
            'folder': './images/folder.sve'
        };

        // 函数调用
        vm.analysis = analysis;
        vm.detail = detail;

        // 获取首页信息
        getMountpoints().then(result => {
            vm.disks = result;
            console.log(vm.disks);
            console.log(vm.mounted);
        });

        // 获取硬盘及分区信息
        function getMountpoints() {
            return new $q((resolve, reject) => {
                let re = /(.+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)/g;
                let result = {}, mounted = [];
                childProcess.exec('df -Hlk | grep sd', (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        console.error(`exec error: ${error}`);
                    } else {
                        let space = stdout.match(re);
                        for (let i = 0, length = space.length; i < length; i++) {
                            if (!(space[i] instanceof Array)) {
                                space[i] = space[i].split(/\s+/);
                            }
                            if (!result[space[i][0].match(/(\D+)/)[1]]) result[space[i][0].match(/(\D+)/)[1]] = [];
                            result[space[i][0].match(/(\D+)/)[1]].push({
                                filesystem: space[i][0],
                                used: space[i][2] * 1024,
                                available: space[i][3] * 1024,
                                capacity: space[i][4],
                                mountpoint: space[i][5]
                            });
                            vm.mounted.push(space[i][5]);
                        }
                        let promises = [];
                        for (let hd in result) {
                            if (result.hasOwnProperty(hd)) {
                                promises.push(new $q((resolve, reject) => {
                                    childProcess.exec(`sudo hdparm -I ${hd}`, (error, stdout, stderr) => {
                                        if (error) {
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
                                            for (let i = 0; i < result[hd].length; i++) {
                                                result[hd]['mountpoint'] += result[hd]['mountpoint'] ? ', ' + result[hd][i]['mountpoint'] : result[hd][i]['mountpoint'];
                                            }
                                            resolve(result[hd]);
                                        }
                                    });
                                }));
                            }
                        }
                        $q.all(promises).then(data => {
                            // ignore '/proc' in Linux
                            vm.mounted.push('/proc');
                            resolve(result);
                        })
                    }
                });
            });
        }

        // 点击文件或文件夹时对其分析
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
                    x: function (d) { return d.key; },
                    y: function (d) { return d.y; },
                    legendPosition: "right",
                    showLabels: true,
                    duration: 500,
                    labelThreshold: 0.01,
                    labelSunbeamLayout: true,
                    yAxis: {
                        axisLabel: 'Values',
                        tickFormat: function (d) {
                            return d3.format('%')(d);
                        }
                    },
                    tooltip: {
                        valueFormatter: function (d, i) {
                            return (d * 100).toFixed(2) + "%";
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
                    x: function (d) { return d.label; },
                    y: function (d) { return d.value; },
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
                            if (d > gb) return parseInt(d / gb) + " GB";
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
            for (let i = 0; i < length; i++) {
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

        // 分析磁盘或硬盘
        function analysis(disks) {
            vm.start = true;
            var startTime = new Date().getTime();
            let promises = disks.map(disk => {
                disk.path = disk.mountpoint;
                disk.name = disk.mountpoint;
                disk.isDirectory = true;
                if (disk.path[disk.path.length - 1] !== '/') {
                    disk.path += '/';
                }
                vm.max += disk.used;
                return new $q((resolve, reject) => {
                    fs.lstat(disk.path, (err, data) => {
                        if (err) {
                            console.log(err);
                            log.push(err);
                            reject(err);
                        } else {
                            Object.assign(disk, data, { file: [], folder: [], size: 0, age: 0, fileCount: 0, folderCount: 0 });
                            resolve(disk);
                        }
                    });
                }).then(disk => search(disk))
            });
            $q.all(promises).then(data => {
                var endTime = new Date().getTime();
                var usedTime = endTime - startTime;
                vm.root.startTime = startTime;
                vm.root.endTime = endTime;
                vm.root.usedTime = usedTime;
                if (data.length === 1) {
                    vm.current = data.size;
                    vm.max = data.size;
                    Object.assign(vm.root, data[0]);
                    vm.finish = true;
                } else {
                    vm.current = 0;
                    vm.root.folder = [];
                    vm.root.size = 0;
                    vm.root.fileCount = vm.root.folderCount = 0;
                    for(let i=0; i<data.length; i++) {
                        vm.current += data[i].size;
                        vm.max += data[i].size;
                        vm.root.size += +data[i].size;
                        vm.root.fileCount += data[i].fileCount;
                        vm.root.folderCount += data[i].folderCount;
                        vm.root.folder.push(data[i]);
                    }
                    vm.root.name = disks.model;
                    vm.finish = true;
                }
                console.log(vm.root);
                console.log(vm.log);
            })
        }

        function search(tree) {
            return new $q((resolve, reject) => {
                fs.readdir(tree.path, (err, data) => {
                    // Use resolve to avoid Promise.all no work
                    if (err) {
                        vm.log.push(err);
                        resolve();
                    } else {
                        let promises = data.map(fileName => {
                            return new $q((resolve, reject) => {
                                fs.lstat(tree.path + fileName, (err, stat) => {
                                    if (err) {
                                        vm.log.push(err);
                                        resolve();
                                    } else {
                                        let mini = {
                                            size: stat.size,
                                            isDirectory: stat.isDirectory()
                                        };
                                        stat = mini;
                                        stat.path = tree.path + fileName;
                                        stat.name = fileName;
                                        vm.currentFile = stat.path;
                                        if (vm.mounted.indexOf(stat.path) !== -1) {
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
                                            vm.current += stat.size;
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
                            vm.log.push(err);
                            console.log(err);
                        });
                    }
                })
            }).then(tree => {
                return new $q((resolve, reject) => {
                    if (tree === void 0 || tree.folder === void 0) resolve(tree);
                    else {
                        let promises = tree.folder.map(stat => {
                            return search(stat);
                        });
                        // datas 是文件夹处理结果
                        $q.all(promises).then(datas => {
                            datas.map(stat => {
                                // 文件夹计算
                                if (stat && stat.isDirectory) tree.folderCount += stat.folderCount + 1;
                                // 容量计算
                                if (stat) {
                                    tree.size += stat.size;
                                    tree.fileCount += stat.fileCount;
                                }
                            });
                            resolve(tree);
                        }).catch(err => {
                            vm.log.push(err);
                        });
                    }
                });
            })
        }
    }
} ());