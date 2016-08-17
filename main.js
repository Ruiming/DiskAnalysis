var fs = require('original-fs');
var os = require('os').platform();
var drivelist = require('drivelist');
const childProcess = require('child_process');

(function() {
    angular
        .module('diskanalysis', ['ui.bootstrap'])
        .controller('MainController', MainController);

    MainController.$inject = ['$interval'];

    function MainController($interval) {
        let vm = this;

        vm.end = false;
        vm.data = null;
        vm.disks = null;

        // 状态显示
        vm.max = 0;
        vm.current = 0;

        vm.analysis = analysis;

        function analysis(disk) {
            const worker = childProcess.fork('worker.js');

            worker.on('message',function(data) {
                console.log(data);
                switch(data.type) {
                    case 'processing':
                        vm.current = data.size;
                        break;
                    case 'end':
                        vm.end = true;
                        break;
                    case 'result':
                        vm.data = data;
                        break;
                    default:
                }
            });
            vm.max = disk.size;
            worker.send(disk.mountpoint);
        }

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
                    return disks;
                }).then(() => {
                    vm.disks = disks;
                    vm.os = os;
                })
            }
        });

        // What can I do to remove this?
        $interval(() => {}, 50);

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
                            usedSpace: space[1],
                            availableSpace: space[2],
                            used: space[3],
                            mountpoint: disk
                        });
                    }
                });
            });
        }

    }
}());
