import getpass
import os
import paramiko
import sys


def deploy_application(zip_file_path, username, password, hostname="sidewalk.umiacs.umd.edu"):
    remote_home_directory = "/nfshomes/kotaro"
    sidewalk_app_directory = remote_home_directory + "/sidewalk-webpage"
    zip_file_name = os.path.split(zip_file_path)[1]
    port = 22

    # Upload the zip file to the remote server
    print "Connecting to %s" % hostname
    transport = paramiko.Transport((hostname, port))
    transport.connect(username=username, password=password)
    print "Connected to the host. Connecting to the SFTP port (%d)" % port
    sftp = paramiko.SFTPClient.from_transport(transport)
    print "SFTP port open. Starting to upload %s to %s" % (zip_file_path, sidewalk_app_directory)

    destination_filename = sidewalk_app_directory + "/" + zip_file_name
    sftp.put(zip_file_path, destination_filename)
    print "Finished uploading the file"
    sftp.close()
    transport.close()


    # Unzip and run the application
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname, username=username, password=password)
    # command = """[ -d "sidewalk-webpage" ] && echo "True" || echo "False"""

    # Check if the sidewalk-webpage directory exists already. If so, change the name of the directory
    print "Checking if the directory `sidewalk-webpage` already exists"
    command = "ls %s" % sidewalk_app_directory
    stdin, stdout, stderr = client.exec_command(command)
    ls_output = stdout.read().split("\n")
    if "sidewalk-webpage" in ls_output:
        print "Chainging the directory name from `sidewalk-webpage` to `_sidewalk-webpage`"
        command = "mv %s %s" % (sidewalk_app_directory + "/sidewalk-webpage", sidewalk_app_directory + "/_sidewalk-webpage")
        client.exec_command(command)

    # Unzip the app and remove the zip file.
    print "Unzipping the files."
    command = "unzip %s -d %s" % (sidewalk_app_directory + "/" + zip_file_name, sidewalk_app_directory)
    client.exec_command(command)
    print "Removing the zip file"
    command = "rm %s" % sidewalk_app_directory + "/sidewalk-webpage.zip"
    # client.exec_command(command)

    # Kill the running process of the running app
    command = "ls %s" % sidewalk_app_directory
    stdin, stdout, stderr = client.exec_command(command)
    ls_output = stdout.read().split("\n")
    if "_sidewalk-webpage" in ls_output:
        # Get the process id and change the directory name to _sidewalk-webpage
        print "Killing the already running process"
        command = "cat %s" % sidewalk_app_directory + "/_sidewalk-webpage/RUNNING_PID"
        stdin, stdout, stderr = client.exec_command(command)
        running_process_id = stdout.read().strip()

        # kill the running process
        command = "kill %s" % running_process_id
        client.exec_command(command)

        # Remove the old directory
        print "Removing `_sidewalk-webpage` directory"
        command = "rm -r %s" % sidewalk_app_directory + "/_sidewalk-webpage"
        client.exec_command(command)

    # Run the app
    print "Changing the file name from %s to %s" % (zip_file_name, "sidewalk-webpage")
    command = "mv %s %s" % (sidewalk_app_directory + "/" + zip_file_name, sidewalk_app_directory + "/sidewalk-webpage")
    client.exec_command(command)

    print "Starting the application"
    command = "%s/sidewalk_runner.sh" % sidewalk_app_directory
    client.exec_command(command)

    client.close()

    pass

if __name__ == '__main__':
    if len(sys.argv) > 1:
        zip_file_path = sys.argv[1]
        username = raw_input("Username:")
        password = getpass.getpass("Password:")
        deploy_application(zip_file_path, username, password)
    else:
        print "Filename not specified. Usage: python deploy.py <filename of the zipped app>"
