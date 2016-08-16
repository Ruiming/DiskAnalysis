var fs = require('fs');
var os = require('os');
var drivelist = require('drivelist');

(function() {
    angular
        .module('diskanalysis', [])
        .controller('MainController', MainController);

    MainController.$inject = ['$scope', '$interval'];

    function MainController($scope) {

        var tree = [];

        $scope.analysis = analysis;

        // 获取硬盘信息
        drivelist.list((error, disks) => {
            if (error) throw error;
            $scope.$apply(() => $scope.disks = disks)
        });

        function analysis(mountpoint) {
            // let dist = mountpoint.split(',');
            let tree = {
                path: '/home/ruiming/Dropbox/',
                file: [],
                folder: [],
                size: 0,
                fileCount: 0,
                folderCount: 0
            };
            search(tree).then(tree => {
                console.log(tree);
            });
        }

        function search(tree) {
            return new Promise((resolve, reject) => {
                fs.readdir(tree.path, (err, data) => {
                    if(err) {
                        console.log(err);
                        reject(err);
                    } else {
                        let promises = data.map(fileName => {
                            return new Promise((resolve, reject) => {
                                fs.stat(tree.path + fileName, (err, data) => {
                                    if (err) {
                                        console.log(err);
                                        reject(err);
                                    } else {
                                        data.path = tree.path + fileName;
                                        if (data.isFile()) {
                                            // 计算文件数，遍历到文件即可父节点加1
                                            // 注意遍历的终点在这里
                                            tree.fileCount ++;
                                            data.fileCount = 1;
                                            tree.file.push(data);
                                        } else {
                                            data.folderCount = 0;
                                            data.path += '/';
                                            data.folder = [];
                                            data.file = [];
                                            data.fileCount = 0;
                                            tree.folder.push(data);
                                        }
                                        resolve(data);
                                    }
                                })
                            });
                        });
                        // { path: '', file: [stat ... ], folder: [stat ...] }
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
                    Promise.all(promises).then((datas) => {
                        datas.map(stat => {
                            if(stat.isDirectory())  tree.folderCount += stat.folderCount || 1;
                            // 计算容量要等待该层次异步结束才能操作
                            tree.size += stat.size;
                            tree.fileCount += stat.fileCount;
                        });
                        resolve(tree);
                    })
                });
            }).then(() => {
                return tree;
            })
        }

    }

}());
