// C snippets for the "C Programs" section — short basics first, then full programs.

export type CProgram = { title: string; code: string };

export const C_PROGRAMS: CProgram[] = [
  { title: "#include", code: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>` },
  { title: "Variables", code: `int age = 20;
float price = 9.5;
char grade = 'A';
double pi = 3.14159;` },
  { title: "printf", code: `printf("Hello\\n");
printf("%d\\n", age);
printf("%.2f\\n", price);
printf("%c\\n", grade);` },
  { title: "scanf", code: `int n;
scanf("%d", &n);
char name[20];
scanf("%s", name);` },
  { title: "Operators", code: `int a = 7, b = 3;
int sum = a + b;
int diff = a - b;
int rem = a % b;
a++;
b--;` },
  { title: "if / else", code: `if (marks >= 40) {
    printf("Pass\\n");
} else {
    printf("Fail\\n");
}` },
  { title: "for loop", code: `for (int i = 1; i <= 5; i++) {
    printf("%d\\n", i);
}` },
  { title: "while loop", code: `int i = 0;
while (i < 5) {
    printf("%d ", i);
    i++;
}` },
  { title: "switch", code: `switch (choice) {
    case 1:
        printf("One\\n");
        break;
    default:
        printf("Other\\n");
}` },
  { title: "Array", code: `int nums[5] = {1, 2, 3, 4, 5};
for (int i = 0; i < 5; i++) {
    printf("%d ", nums[i]);
}` },
  { title: "Function", code: `int add(int a, int b) {
    return a + b;
}` },
  { title: "Pointer", code: `int x = 10;
int *p = &x;
printf("%d\\n", *p);
*p = 20;` },
  { title: "Hello World", code: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}` },
  { title: "Sum of Two Numbers", code: `#include <stdio.h>

int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("Sum = %d\\n", a + b);
    return 0;
}` },
  { title: "Even or Odd", code: `#include <stdio.h>

int main() {
    int n;
    scanf("%d", &n);
    if (n % 2 == 0)
        printf("Even\\n");
    else
        printf("Odd\\n");
    return 0;
}` },
  { title: "Factorial", code: `#include <stdio.h>

int main() {
    int n;
    long fact = 1;
    scanf("%d", &n);
    for (int i = 1; i <= n; i++) {
        fact *= i;
    }
    printf("%ld\\n", fact);
    return 0;
}` },
  { title: "Fibonacci Series", code: `#include <stdio.h>

int main() {
    int n, a = 0, b = 1, next;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) {
        printf("%d ", a);
        next = a + b;
        a = b;
        b = next;
    }
    return 0;
}` },
  { title: "Prime Check", code: `int isPrime(int n) {
    if (n < 2) return 0;
    for (int i = 2; i * i <= n; i++) {
        if (n % i == 0) return 0;
    }
    return 1;
}` },
  { title: "Swap with Pointers", code: `void swap(int *x, int *y) {
    int temp = *x;
    *x = *y;
    *y = temp;
}` },
  { title: "Largest in Array", code: `int max = arr[0];
for (int i = 1; i < n; i++) {
    if (arr[i] > max)
        max = arr[i];
}
printf("Max = %d\\n", max);` },
  { title: "Reverse a String", code: `int len = strlen(s);
for (int i = 0; i < len / 2; i++) {
    char t = s[i];
    s[i] = s[len - 1 - i];
    s[len - 1 - i] = t;
}` },
  { title: "Struct", code: `struct Student {
    char name[50];
    int roll;
    float marks;
};

struct Student s = {"Asha", 7, 91.5};` },
  { title: "Bubble Sort", code: `for (int i = 0; i < n - 1; i++) {
    for (int j = 0; j < n - i - 1; j++) {
        if (a[j] > a[j + 1]) {
            int t = a[j];
            a[j] = a[j + 1];
            a[j + 1] = t;
        }
    }
}` },
  { title: "Linked List Node", code: `struct Node {
    int data;
    struct Node *next;
};

struct Node *n = malloc(sizeof(struct Node));
n->data = 5;
n->next = NULL;` },
  { title: "Binary Search", code: `int lo = 0, hi = n - 1;
while (lo <= hi) {
    int mid = lo + (hi - lo) / 2;
    if (a[mid] == key) return mid;
    if (a[mid] < key) lo = mid + 1;
    else hi = mid - 1;
}
return -1;` },
  { title: "File Write", code: `FILE *fp = fopen("notes.txt", "w");
if (fp == NULL) return 1;
fprintf(fp, "Typing in C!\\n");
fclose(fp);` },
];
