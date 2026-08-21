#include <stdio.h>
#include <unistd.h>

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fputs("process-group launcher requires a command\n", stderr);
        return 64;
    }

    if (setpgid(0, 0) != 0) {
        perror("setpgid");
        return 126;
    }

    execvp(argv[1], &argv[1]);
    perror("execvp");
    return 127;
}
