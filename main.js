var fs = require('original-fs');
var os = require('os');
var drivelist = require('drivelist');

(function() {
    angular
        .module('diskanalysis', [])
        .controller('MainController', MainController);

    MainController.$inject = ['$scope', '$interval'];

    function MainController($scope, $interval) {
        var root = {};
        var log = [];
        $scope.analysis = analysis;

        // 获取硬盘信息
        drivelist.list((error, disks) => {
            if (error) throw error;
            $scope.$apply(() => $scope.disks = disks)
        });

        function analysis(mountpoint) {
            var startTime = new Date().getTime();
            let dist = mountpoint.split(',');
            if(dist.indexOf('/') !== -1) {
                // TODO
                root.path = '/home/';
                new Promise((resolve, reject) => {
                    fs.stat(root.path, (err, data) => {
                        if(err) {
                            log.push(err);
                            reject(err);
                        } else {
                            Object.assign(root, data, {file: [], folder: [], size: 0, fileCount: 0, folderCount: 0});
                            resolve(root);
                        }
                    });
                }).then(root => search(root))
                    .then(() => {
                        console.log(root);
                        var endTime = new Date().getTime();
                        console.log(endTime - startTime + "ms");
                        // debugger;
                        console.log(log);
                    });
            }
        }

        function search(tree) {
            return new Promise((resolve, reject) => {
                fs.readdir(tree.path, (err, data) => {
                    if (err) {
                        // TODO
                        log.push(err);
                        resolve();
                    } else {
                        let promises = data.map(fileName => {
                            return new Promise((resolve, reject) => {
                                fs.stat(tree.path + fileName, (err, data) => {
                                    if (err) {
                                        // TODO
                                        log.push(err);
                                        resolve();
                                    } else {
                                        data.path = tree.path + fileName;
                                        if (data.isDirectory()) {
                                            data.folderCount = 0;
                                            data.path += '/';
                                            data.folder = [];
                                            data.file = [];
                                            data.fileCount = 0;
                                            tree.folder.push(data);
                                        } else {
                                            // 文件数计算
                                            tree.size += data.size;
                                            tree.fileCount++;
                                            data.fileCount = 1;
                                            tree.file.push(data);
                                        }
                                        resolve(data);
                                    }
                                })
                            });
                        });
                        Promise.all(promises).then(() => {
                            resolve(tree);
                        });
                    }
                })
            }).then(tree => {
                    return new Promise((resolve, reject) => {
                        let promises = tree.folder.map(stat => {
                            return search(stat);
                        });
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
                            debugger;
                        });
                    });
            })
        }
    }

}());
